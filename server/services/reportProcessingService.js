const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const {
  A1Service,
  ReportService,
  computeHistoricalBaseline,
  defaultA1Config,
} = require("../../shared/src/uml_service_layout");
const Report = require("../models/Report");
const ReportTagMetadata = require("../models/ReportTagMetadata");
const StudyLocation = require("../models/StudyLocation");
const LocationGroup = require("../models/LocationGroup");
const User = require("../models/User");
const {
  StudyLocationRepository,
} = require("../repositories/StudyLocationRepository");
const {
  LocationGroupRepository,
} = require("../repositories/LocationGroupRepository");
const {
  findCatalogGroup,
  findCatalogLocation,
} = require("./locationCatalog");

function toReport(document) {
  return {
    reportId: document.reportId,
    reportKind: document.reportKind ?? "live",
    userId: document.userId,
    studyLocationId: document.studyLocationId,
    createdAt: new Date(document.createdAt),
    avgNoise: document.avgNoise,
    maxNoise: document.maxNoise,
    variance: document.variance,
    occupancy: document.occupancy,
  };
}

function toArchivedReportSummary(document) {
  return {
    reportId: document.reportId,
    reportKind: document.reportKind ?? "archive_summary",
    studyLocationId: document.studyLocationId,
    createdAt: new Date(document.createdAt),
    avgNoise: document.avgNoise,
    occupancy: document.occupancy,
    windowStart: new Date(document.windowStart),
    windowEnd: new Date(document.windowEnd),
  };
}

function toMetadata(document) {
  return {
    reportId: document.reportId,
    decayFactor: document.decayFactor,
    varianceCorrectionWF: document.varianceCorrectionWF,
    sessionCorrectionNoiseWF: document.sessionCorrectionNoiseWF,
    noiseWeightFactor: document.noiseWeightFactor,
    occupancyWeightFactor: document.occupancyWeightFactor,
    lastEvaluatedAt: new Date(document.lastEvaluatedAt),
  };
}

function toUser(document) {
  return {
    userId: document.userId,
    email: document.email,
    firstName: document.firstName,
    favorites: [...(document.favorites ?? [])],
    displayName: document.displayName,
    hideLocation: Boolean(document.hideLocation),
    pinColor: document.pinColor ?? "#0F766E",
    userNoiseWF: document.userNoiseWF,
    userOccupancyWF: document.userOccupancyWF,
  };
}

class MongooseReportRepository {
  async createReport(reportData) {
    const saved = await new Report({
      reportId: crypto.randomUUID(),
      reportKind: "live",
      userId: reportData.userId,
      studyLocationId: reportData.studyLocationId,
      createdAt: reportData.createdAt ?? new Date(),
      avgNoise: reportData.avgNoise,
      maxNoise: reportData.maxNoise,
      variance: reportData.variance,
      occupancy: reportData.occupancy,
    }).save();

    return toReport(saved);
  }

  async getRecentReports() {
    const reports = await Report.find({ reportKind: "live" })
      .sort({ createdAt: -1 })
      .lean();
    return this.#attachMetadata(reports);
  }

  async getReportsByLocation(studyLocationId) {
    const reports = await Report.find({
      studyLocationId,
      reportKind: "live",
    })
      .sort({ createdAt: -1 })
      .lean();
    return this.#attachMetadata(reports);
  }

  async getAllReportsWithMetadata() {
    const reports = await Report.find({ reportKind: "live" })
      .sort({ createdAt: -1 })
      .lean();
    return this.#attachMetadata(reports);
  }

  async upsertReportMetadata(records) {
    if (records.length === 0) {
      return;
    }

    await ReportTagMetadata.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { reportId: record.reportId },
          update: {
            $set: {
              decayFactor: record.decayFactor,
              varianceCorrectionWF: record.varianceCorrectionWF,
              sessionCorrectionNoiseWF: record.sessionCorrectionNoiseWF,
              noiseWeightFactor: record.noiseWeightFactor,
              occupancyWeightFactor: record.occupancyWeightFactor,
              lastEvaluatedAt: record.lastEvaluatedAt,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  async deleteReports(reportIds) {
    if (reportIds.length === 0) {
      return;
    }

    await Promise.all([
      Report.deleteMany({ reportId: { $in: reportIds } }),
      ReportTagMetadata.deleteMany({ reportId: { $in: reportIds } }),
    ]);
  }

  async createArchivedReports(records) {
    if (records.length === 0) {
      return;
    }

    await Report.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { reportId: record.reportId },
          update: {
            $set: {
              reportId: record.reportId,
              reportKind: "archive_summary",
              userId: null,
              studyLocationId: record.studyLocationId,
              createdAt: record.createdAt,
              avgNoise: record.avgNoise,
              maxNoise: null,
              variance: null,
              occupancy: record.occupancy,
              windowStart: record.windowStart,
              windowEnd: record.windowEnd,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  async #attachMetadata(reports) {
    if (reports.length === 0) {
      return [];
    }

    const reportIds = reports.map((report) => report.reportId);
    const metadataRows = await ReportTagMetadata.find({ reportId: { $in: reportIds } }).lean();
    const metadataById = new Map(metadataRows.map((row) => [row.reportId, toMetadata(row)]));

    return reports.map((report) => ({
      report: toReport(report),
      metadata: metadataById.get(report.reportId),
    }));
  }
}

class MongooseUserRepository {
  async findUsersByIds(userIds) {
    const users = await User.find({ userId: { $in: userIds } }).lean();
    return users.map(toUser);
  }

  async updateUser(user) {
    const updated = await User.findOneAndUpdate(
      { userId: user.userId },
      {
        $set: {
          firstName: user.firstName ?? null,
          displayName: user.displayName ?? null,
          hideLocation: Boolean(user.hideLocation),
          pinColor: user.pinColor ?? "#0F766E",
          favorites: user.favorites ?? [],
          userNoiseWF: user.userNoiseWF,
          userOccupancyWF: user.userOccupancyWF,
        },
      },
      { new: true },
    ).lean();

    return updated ? toUser(updated) : user;
  }
}

class ReportProcessingService {
  constructor() {
    this.reportRepository = new MongooseReportRepository();
    this.userRepository = new MongooseUserRepository();
    this.studyLocationRepository = new StudyLocationRepository();
    this.locationGroupRepository = new LocationGroupRepository();
    this.a1Service = new A1Service(
      this.reportRepository,
      this.userRepository,
      this.studyLocationRepository,
      this.locationGroupRepository,
    );
    this.reportService = new ReportService(this.reportRepository, this.a1Service);
    this.pollTimer = null;
    this.pollInFlight = null;
  }

  async submitCanonicalReport(reportData) {
    await this.#ensureCatalogLocation(reportData.studyLocationId);
    await this.#ensureCollectorUser(reportData.userId);

    const report = await this.reportService.submitNewReport(reportData);
    const metadataRecords = await this.reportRepository.getReportsByLocation(report.studyLocationId);
    const createdRecord =
      metadataRecords.find((record) => record.report.reportId === report.reportId) ?? null;
    const studyLocation = await this.studyLocationRepository.getStudyLocationById(
      report.studyLocationId,
    );
    const locationGroup = studyLocation
      ? await this.locationGroupRepository.getLocationGroupById(studyLocation.locationGroupId)
      : null;

    return {
      report,
      metadata: createdRecord?.metadata ?? null,
      studyLocation,
      locationGroup,
      cycle: null,
    };
  }

  async runPollingCycle(now = new Date()) {
    return this.a1Service.runPollingCycle(now);
  }

  async listArchivedSummariesByLocation(
    studyLocationId,
    { from = null, to = null, limit = 500 } = {},
  ) {
    const filter = {
      studyLocationId,
      reportKind: "archive_summary",
    };

    if (from || to) {
      filter.windowStart = {};

      if (from) {
        filter.windowStart.$gte = from;
      }

      if (to) {
        filter.windowStart.$lt = to;
      }
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
    const summaries = await Report.find(filter)
      .sort({ windowStart: 1 })
      .limit(safeLimit)
      .lean();

    return summaries.map(toArchivedReportSummary);
  }

  async getHistoricalBaseline(studyLocationId, now = new Date()) {
    const maxAgeDays = defaultA1Config.historicalMaxAgeDays || 30;
    const from = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

    const summaries = await this.listArchivedSummariesByLocation(studyLocationId, {
      from,
      to: now,
      limit: 1000,
    });

    return computeHistoricalBaseline(summaries, now, defaultA1Config);
  }

  startPollingLoop(pollIntervalMs = 60_000) {
    if (this.pollTimer) {
      return;
    }

    const safePollIntervalMs = Math.max(1_000, Number(pollIntervalMs) || 60_000);
    const pollOnce = async () => {
      if (this.pollInFlight) {
        return this.pollInFlight;
      }

      this.pollInFlight = this.runPollingCycle()
        .catch((error) => {
          console.error("A1 polling cycle failed:", error.message);
          return null;
        })
        .finally(() => {
          this.pollInFlight = null;
        });

      return this.pollInFlight;
    };

    this.pollTimer = setInterval(() => {
      void pollOnce();
    }, safePollIntervalMs);

    if (typeof this.pollTimer.unref === "function") {
      this.pollTimer.unref();
    }

    void pollOnce();
  }

  stopPollingLoop() {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async #ensureCatalogLocation(studyLocationId) {
    const existing = await StudyLocation.findOne({ studyLocationId }).select("studyLocationId");
    if (existing) {
      return;
    }

    const catalogLocation = findCatalogLocation(studyLocationId);
    if (!catalogLocation) {
      throw new Error(`Study location ${studyLocationId} is not configured.`);
    }

    const catalogGroup = findCatalogGroup(catalogLocation.locationGroupId);
    if (!catalogGroup) {
      throw new Error(`Location group ${catalogLocation.locationGroupId} is not configured.`);
    }

    await LocationGroup.findOneAndUpdate(
      { locationGroupId: catalogGroup.locationGroupId },
      {
        $setOnInsert: {
          locationGroupId: catalogGroup.locationGroupId,
          name: catalogGroup.name,
          currentNoiseLevel: null,
          currentOccupancyLevel: null,
          updatedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    await StudyLocation.findOneAndUpdate(
      { studyLocationId: catalogLocation.studyLocationId },
      {
        $setOnInsert: {
          studyLocationId: catalogLocation.studyLocationId,
          locationGroupId: catalogLocation.locationGroupId,
          name: catalogLocation.name,
          latitude: catalogLocation.latitude,
          longitude: catalogLocation.longitude,
          currentNoiseLevel: null,
          currentOccupancyLevel: null,
          updatedAt: null,
        },
      },
      { upsert: true, new: true },
    );
  }

  async #ensureCollectorUser(userId) {
    const normalizedUserId =
      typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : "local-user";
    const existing = await User.findOne({ userId: normalizedUserId }).select("userId");
    if (existing) {
      return normalizedUserId;
    }

    const passwordHash = await bcrypt.hash(`collector-${normalizedUserId}`, 10);
    const safeLogin = normalizedUserId.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    await new User({
      userId: normalizedUserId,
      login: `collector-${safeLogin}`,
      email: `${safeLogin}@local.invalid`,
      passwordHash,
      firstName: "Local",
      lastName: "Collector",
      displayName: "Local Collector",
      hideLocation: false,
      pinColor: "#0F766E",
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      role: "user",
      accountStatus: "active",
      emailVerifiedAt: new Date(),
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
      passwordResetCode: null,
      passwordResetCodeExpiresAt: null,
      passwordChangedAt: new Date(),
    }).save();

    return normalizedUserId;
  }
}

module.exports = {
  ReportProcessingService,
};
