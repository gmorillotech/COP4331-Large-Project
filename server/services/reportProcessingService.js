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
const User = require("../models/User");
const {
  StudyLocationRepository,
} = require("../repositories/StudyLocationRepository");
const {
  LocationGroupRepository,
} = require("../repositories/LocationGroupRepository");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

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
    const existingLocation = await StudyLocation.findOne({
      studyLocationId: reportData.studyLocationId,
    }).select("studyLocationId");
    if (!existingLocation) {
      throw new Error(`Study location ${reportData.studyLocationId} is not configured.`);
    }
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

    // Fire-and-forget: kick A1 so the submitter sees the new aggregation on
    // the next frontend refresh rather than waiting up to the full scheduled
    // polling interval. The pollInFlight guard inside triggerPollNow
    // coalesces concurrent submissions. Not awaited — HTTP response returns
    // on the same timing it does today; the cycle runs in the background.
    // If this cycle fails for any reason, the scheduled interval cycle will
    // still pick up the freshly-saved Report row on its own cadence.
    void this.triggerPollNow();

    return {
      report,
      metadata: createdRecord?.metadata ?? null,
      studyLocation,
      locationGroup,
      cycle: null,
    };
  }

  async runPollingCycle(now = new Date()) {
    // Diagnostic log around every A1 cycle. If report visibility ever
    // regresses again, `active` / `locations` / `groups` counts per cycle
    // reveal whether reports are being dropped from aggregation or the
    // cycle is silently erroring. Stdout-only; cheap to run.
    const started = Date.now();
    try {
      const result = await this.a1Service.runPollingCycle(now);
      // Log only fields that exist on the running runPollingCycle return
      // shape. archivedSummaries / compressedReportIds are defined on the
      // .ts source but the compiled .js we actually execute does not
      // return them — referencing them throws "Cannot read properties of
      // undefined (reading 'length')" which previously poisoned every
      // cycle and made it look like A1 was failing.
      console.log(
        `[A1] cycle ok (${Date.now() - started} ms): ` +
          `active=${result.activeReportCount}, ` +
          `locations=${result.updatedStudyLocations.length}, ` +
          `groups=${result.updatedLocationGroups.length}, ` +
          `deleted=${result.staleReportIds.length}`,
      );
      return result;
    } catch (error) {
      console.error(
        `[A1] cycle FAILED after ${Date.now() - started} ms: ${error.message}`,
      );
      // Stack trace so we can see which function inside the A1 pipeline
      // triggered the failure. Without this the caller only logs the
      // message and swallows the frame info.
      console.error(error.stack);
      throw error;
    }
  }

  // On-demand A1 trigger. Safe to call from anywhere (submission hot path,
  // manual admin actions, tests). Coalesces concurrent calls via
  // pollInFlight so bursts of submissions collapse to at most one extra
  // cycle queued behind the currently-running one. Never rejects — any
  // failure is logged and swallowed so callers can use `void` without
  // needing try/catch.
  async triggerPollNow() {
    if (this.pollInFlight) {
      return this.pollInFlight;
    }
    this.pollInFlight = this.runPollingCycle()
      .catch((error) => {
        console.error("On-demand A1 cycle failed:", error.message);
        return null;
      })
      .finally(() => {
        this.pollInFlight = null;
      });
    return this.pollInFlight;
  }

  async listArchivedSummariesByLocation(
    studyLocationId,
    {
      from = null,
      to = null,
      limit = SERVER_RUNTIME_CONFIG.reports.archivedSummaryDefaultLimit,
    } = {},
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

    const {
      archivedSummaryDefaultLimit: defaultLimit,
      archivedSummaryMaxLimit: maxLimit,
    } = SERVER_RUNTIME_CONFIG.reports;
    const safeLimit = Math.max(1, Math.min(maxLimit, Number(limit) || defaultLimit));
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
      limit: SERVER_RUNTIME_CONFIG.reports.historicalBaselineFetchLimit,
    });

    return computeHistoricalBaseline(summaries, now, defaultA1Config);
  }

  startPollingLoop(
    pollIntervalMs = SERVER_RUNTIME_CONFIG.polling.reportPollIntervalMs,
  ) {
    if (this.pollTimer) {
      return;
    }

    const {
      reportPollIntervalMs: defaultInterval,
      minimumPollIntervalMs: minInterval,
    } = SERVER_RUNTIME_CONFIG.polling;
    const safePollIntervalMs = Math.max(
      minInterval,
      Number(pollIntervalMs) || defaultInterval,
    );
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
      role: "user",
      accountStatus: "active",
      firstName: "Local",
      lastName: "Collector",
      displayName: "Local Collector",
      hideLocation: false,
      pinColor: "#0F766E",
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
      emailVerifiedAt: new Date(),
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
