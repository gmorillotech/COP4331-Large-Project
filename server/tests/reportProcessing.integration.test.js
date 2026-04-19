const assert = require("node:assert/strict");

const Report = require("../models/Report");
const ReportTagMetadata = require("../models/ReportTagMetadata");
const StudyLocation = require("../models/StudyLocation");
const LocationGroup = require("../models/LocationGroup");
const User = require("../models/User");
const { ReportProcessingService } = require("../services/reportProcessingService");

const registeredTests = [];

function it(name, run) {
  registeredTests.push({ name, run });
}

function createChain(value) {
  return {
    lean: async () => clone(value),
    select: () => ({
      lean: async () => clone(value),
      then: (resolve, reject) => Promise.resolve(clone(value)).then(resolve, reject),
    }),
    sort: () => ({
      lean: async () => clone(value),
      limit: async () => clone(value),
      then: (resolve, reject) => Promise.resolve(clone(value)).then(resolve, reject),
    }),
    limit: async () => clone(value),
    then: (resolve, reject) => Promise.resolve(clone(value)).then(resolve, reject),
  };
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    ...value,
    ...(value.createdAt ? { createdAt: new Date(value.createdAt) } : {}),
    ...(value.updatedAt ? { updatedAt: new Date(value.updatedAt) } : {}),
    ...(value.lastEvaluatedAt ? { lastEvaluatedAt: new Date(value.lastEvaluatedAt) } : {}),
    ...(value.windowStart ? { windowStart: new Date(value.windowStart) } : {}),
    ...(value.windowEnd ? { windowEnd: new Date(value.windowEnd) } : {}),
    ...(value.favorites ? { favorites: [...value.favorites] } : {}),
  };
}

function installInMemoryModelPatches() {
  const state = {
    reports: [],
    metadata: [],
    users: [],
    studyLocations: [
      {
        studyLocationId: "library-floor-1-quiet",
        locationGroupId: "group-john-c-hitt-library",
        name: "Quiet Study",
        floorLabel: "Floor 1",
        sublocationLabel: "North Reading Room",
        latitude: 28.60024,
        longitude: -81.20182,
        currentNoiseLevel: null,
        currentOccupancyLevel: null,
        updatedAt: null,
      },
    ],
    locationGroups: [
      {
        locationGroupId: "group-john-c-hitt-library",
        name: "John C. Hitt Library",
        currentNoiseLevel: null,
        currentOccupancyLevel: null,
        updatedAt: null,
      },
    ],
  };

  const originals = {
    reportSave: Report.prototype.save,
    reportFind: Report.find,
    reportBulkWrite: Report.bulkWrite,
    reportDeleteMany: Report.deleteMany,
    metadataFind: ReportTagMetadata.find,
    metadataBulkWrite: ReportTagMetadata.bulkWrite,
    metadataDeleteMany: ReportTagMetadata.deleteMany,
    studyLocationFind: StudyLocation.find,
    studyLocationFindOne: StudyLocation.findOne,
    studyLocationFindOneAndUpdate: StudyLocation.findOneAndUpdate,
    locationGroupFind: LocationGroup.find,
    locationGroupFindOne: LocationGroup.findOne,
    locationGroupFindOneAndUpdate: LocationGroup.findOneAndUpdate,
    userSave: User.prototype.save,
    userFind: User.find,
    userFindOne: User.findOne,
    userFindOneAndUpdate: User.findOneAndUpdate,
  };

  Report.prototype.save = async function saveReport() {
    const document = {
      reportId: this.reportId,
      reportKind: this.reportKind,
      userId: this.userId,
      studyLocationId: this.studyLocationId,
      createdAt: this.createdAt,
      avgNoise: this.avgNoise,
      maxNoise: this.maxNoise,
      variance: this.variance,
      occupancy: this.occupancy,
    };
    state.reports.push(clone(document));
    return clone(document);
  };

  Report.find = (filter = {}) => {
    let results = state.reports.filter((report) =>
      Object.entries(filter).every(([key, value]) => {
        if (value && typeof value === "object" && Array.isArray(value.$in)) {
          return value.$in.includes(report[key]);
        }

        if (value && typeof value === "object" && "$ne" in value) {
          return report[key] !== value.$ne;
        }

        return report[key] === value;
      }),
    );

    return {
      sort(sortSpec) {
        const [[key, direction]] = Object.entries(sortSpec);
        results = [...results].sort((left, right) =>
          direction >= 0
            ? left[key] > right[key] ? 1 : -1
            : left[key] < right[key] ? 1 : -1,
        );

        return {
          lean: async () => clone(results),
          limit: async (count) => clone(results.slice(0, count)),
          then: (resolve, reject) => Promise.resolve(clone(results)).then(resolve, reject),
        };
      },
    };
  };

  Report.bulkWrite = async (operations) => {
    for (const operation of operations) {
      const record = {
        reportId: operation.updateOne.filter.reportId,
        ...operation.updateOne.update.$set,
      };
      const index = state.reports.findIndex((item) => item.reportId === record.reportId);
      if (index >= 0) {
        state.reports[index] = clone(record);
      } else {
        state.reports.push(clone(record));
      }
    }
  };

  Report.deleteMany = async (filter) => {
    const ids = filter.reportId?.$in ?? [];
    state.reports = state.reports.filter((report) => !ids.includes(report.reportId));
  };

  ReportTagMetadata.find = (filter = {}) => {
    const ids = filter.reportId?.$in ?? [];
    const results =
      ids.length === 0
        ? state.metadata
        : state.metadata.filter((item) => ids.includes(item.reportId));
    return createChain(results);
  };

  ReportTagMetadata.bulkWrite = async (operations) => {
    for (const operation of operations) {
      const record = {
        reportId: operation.updateOne.filter.reportId,
        ...operation.updateOne.update.$set,
      };
      const index = state.metadata.findIndex((item) => item.reportId === record.reportId);
      if (index >= 0) {
        state.metadata[index] = clone(record);
      } else {
        state.metadata.push(clone(record));
      }
    }
  };

  ReportTagMetadata.deleteMany = async (filter) => {
    const ids = filter.reportId?.$in ?? [];
    state.metadata = state.metadata.filter((item) => !ids.includes(item.reportId));
  };

  StudyLocation.find = () => createChain(state.studyLocations);
  StudyLocation.findOne = (filter) =>
    createChain(
      state.studyLocations.find((location) => location.studyLocationId === filter.studyLocationId) ?? null,
    );
  StudyLocation.findOneAndUpdate = (filter, update) => {
    const existingIndex = state.studyLocations.findIndex(
      (location) => location.studyLocationId === filter.studyLocationId,
    );
    const existing = existingIndex >= 0 ? state.studyLocations[existingIndex] : null;
    const nextValue = {
      ...(existing ?? {}),
      ...(update.$setOnInsert ?? (existing ? {} : {})),
      ...(update.$set ?? {}),
    };

    if (existingIndex >= 0) {
      state.studyLocations[existingIndex] = clone(nextValue);
    } else {
      state.studyLocations.push(clone(nextValue));
    }

    return createChain(nextValue);
  };

  LocationGroup.find = () => createChain(state.locationGroups);
  LocationGroup.findOne = (filter) =>
    createChain(
      state.locationGroups.find((group) => group.locationGroupId === filter.locationGroupId) ?? null,
    );
  LocationGroup.findOneAndUpdate = (filter, update) => {
    const existingIndex = state.locationGroups.findIndex(
      (group) => group.locationGroupId === filter.locationGroupId,
    );
    const existing = existingIndex >= 0 ? state.locationGroups[existingIndex] : null;
    const nextValue = {
      ...(existing ?? {}),
      ...(update.$setOnInsert ?? (existing ? {} : {})),
      ...(update.$set ?? {}),
    };

    if (existingIndex >= 0) {
      state.locationGroups[existingIndex] = clone(nextValue);
    } else {
      state.locationGroups.push(clone(nextValue));
    }

    return createChain(nextValue);
  };

  User.prototype.save = async function saveUser() {
    const document = {
      userId: this.userId,
      login: this.login,
      email: this.email,
      passwordHash: this.passwordHash,
      role: this.role,
      accountStatus: this.accountStatus,
      firstName: this.firstName,
      lastName: this.lastName,
      displayName: this.displayName,
      favorites: [...(this.favorites ?? [])],
      userNoiseWF: this.userNoiseWF,
      userOccupancyWF: this.userOccupancyWF,
      emailVerificationCode: this.emailVerificationCode,
      emailVerificationExpiresAt: this.emailVerificationExpiresAt,
      emailVerifiedAt: this.emailVerifiedAt,
      passwordResetCode: this.passwordResetCode,
      passwordResetCodeExpiresAt: this.passwordResetCodeExpiresAt,
    };
    state.users.push(clone(document));
    return clone(document);
  };

  User.find = (filter = {}) => {
    const ids = filter.userId?.$in ?? [];
    const results =
      ids.length === 0 ? state.users : state.users.filter((user) => ids.includes(user.userId));
    return createChain(results);
  };
  User.findOne = (filter) =>
    createChain(
      state.users.find((user) =>
        Object.entries(filter).every(([key, value]) => user[key] === value),
      ) ?? null,
    );
  User.findOneAndUpdate = (filter, update) => {
    const existingIndex = state.users.findIndex((user) => user.userId === filter.userId);
    if (existingIndex < 0) {
      return createChain(null);
    }

    state.users[existingIndex] = {
      ...state.users[existingIndex],
      ...update.$set,
    };
    return createChain(state.users[existingIndex]);
  };

  return {
    state,
    restore() {
      Report.prototype.save = originals.reportSave;
      Report.find = originals.reportFind;
      Report.bulkWrite = originals.reportBulkWrite;
      Report.deleteMany = originals.reportDeleteMany;
      ReportTagMetadata.find = originals.metadataFind;
      ReportTagMetadata.bulkWrite = originals.metadataBulkWrite;
      ReportTagMetadata.deleteMany = originals.metadataDeleteMany;
      StudyLocation.find = originals.studyLocationFind;
      StudyLocation.findOne = originals.studyLocationFindOne;
      StudyLocation.findOneAndUpdate = originals.studyLocationFindOneAndUpdate;
      LocationGroup.find = originals.locationGroupFind;
      LocationGroup.findOne = originals.locationGroupFindOne;
      LocationGroup.findOneAndUpdate = originals.locationGroupFindOneAndUpdate;
      User.prototype.save = originals.userSave;
      User.find = originals.userFind;
      User.findOne = originals.userFindOne;
      User.findOneAndUpdate = originals.userFindOneAndUpdate;
    },
  };
}

it("submitCanonicalReport persists report metadata and leaves aggregate state for polling", async () => {
  const harness = installInMemoryModelPatches();
  // Initial state already seeds "library-floor-1-quiet" and "group-john-c-hitt-library"
  const service = new ReportProcessingService();

  try {
    const createdAt = new Date("2026-03-30T18:00:00.000Z");
    const first = await service.submitCanonicalReport({
      studyLocationId: "library-floor-1-quiet",
      userId: "collector-1",
      createdAt,
      avgNoise: 48,
      maxNoise: 53,
      variance: 4,
      occupancy: 2,
    });

    const second = await service.submitCanonicalReport({
      userId: "collector-2",
      studyLocationId: "library-floor-1-quiet",
      createdAt: new Date("2026-03-30T18:01:00.000Z"),
      avgNoise: 60,
      maxNoise: 66,
      variance: 6,
      occupancy: 4,
    });

    assert.equal(harness.state.reports.length, 2);
    assert.equal(harness.state.metadata.length, 2);
    assert.equal(harness.state.users.length, 0); // no collector accounts auto-created
    assert.equal(harness.state.studyLocations.length, 1);
    assert.equal(harness.state.locationGroups.length, 1);

    assert.ok(first.report.reportId);
    assert.ok(first.metadata);
    assert.ok(second.studyLocation);
    assert.ok(second.locationGroup);
    assert.equal(second.cycle, null);
    assert.equal(second.studyLocation.studyLocationId, "library-floor-1-quiet");
    assert.equal(
      second.locationGroup.locationGroupId,
      "group-john-c-hitt-library",
    );
    assert.equal(second.studyLocation.currentNoiseLevel, null);
    assert.equal(second.studyLocation.currentOccupancyLevel, null);
    assert.equal(second.locationGroup.currentNoiseLevel, null);
    assert.equal(second.locationGroup.currentOccupancyLevel, null);
    assert.equal(harness.state.reports[0].reportKind, "live");
  } finally {
    harness.restore();
  }
});

it("runPollingCycle retains reports across the 20-minute boundary", async () => {
  // Regression test for the "reports vanish after ~20 min" bug. With the
  // current retention config (reportHalfLifeMs=48h, archiveThresholdMs=48h,
  // minWeightThreshold=0.05), a report that is merely 21-25 minutes old
  // MUST still be counted as active. If this assertion ever fails the
  // regression is in one of: decay formula, minWeightThreshold, the
  // reportKind:"live" filter in getAllReportsWithMetadata, or the archive
  // compression threshold. `totalReportCount` vs `activeReportCount`
  // distinguishes which.
  //
  // We seed state directly rather than go through submitCanonicalReport so
  // this test is not perturbed by the fire-and-forget triggerPollNow call
  // the submission path issues (which would otherwise race with the cycle
  // we explicitly invoke below).
  const harness = installInMemoryModelPatches();
  const service = new ReportProcessingService();

  try {
    const now = new Date("2026-03-30T18:30:00.000Z");
    const twentyOneMinAgo = new Date(now.getTime() - 21 * 60 * 1000);
    const twentyFiveMinAgo = new Date(now.getTime() - 25 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    harness.state.reports.push(
      {
        reportId: "r-21",
        reportKind: "live",
        userId: null,
        studyLocationId: "library-floor-1-quiet",
        createdAt: twentyOneMinAgo,
        avgNoise: 50,
        maxNoise: 55,
        variance: 4,
        occupancy: 2,
      },
      {
        reportId: "r-25",
        reportKind: "live",
        userId: null,
        studyLocationId: "library-floor-1-quiet",
        createdAt: twentyFiveMinAgo,
        avgNoise: 52,
        maxNoise: 58,
        variance: 5,
        occupancy: 3,
      },
      {
        reportId: "r-30",
        reportKind: "live",
        userId: null,
        studyLocationId: "library-floor-1-quiet",
        createdAt: thirtyMinAgo,
        avgNoise: 48,
        maxNoise: 54,
        variance: 3,
        occupancy: 2,
      },
    );

    const result = await service.runPollingCycle(now);

    assert.equal(
      result.totalReportCount,
      3,
      "all three live reports must be read from the repository — if this is 0, Bug B (persistence/kind-flip) regressed",
    );
    assert.equal(
      result.activeReportCount,
      3,
      "all three reports must stay active across the 20-minute boundary — if this is 0 while totalReportCount is 3, Bug B's decay/session logic regressed",
    );
    assert.equal(
      result.staleReportIds.length,
      0,
      "no report this young should ever be deleted as stale",
    );

    const [location] = result.updatedStudyLocations;
    assert.ok(
      Number.isFinite(location.currentNoiseLevel),
      "StudyLocation must have a numeric currentNoiseLevel (not null) after the cycle",
    );
    assert.ok(
      Number.isFinite(location.currentOccupancyLevel),
      "StudyLocation must have a numeric currentOccupancyLevel (not null) after the cycle",
    );
  } finally {
    harness.restore();
  }
});

void run();

async function run() {
  let failures = 0;

  for (const testCase of registeredTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`All ${registeredTests.length} report-processing integration tests passed.`);
}
