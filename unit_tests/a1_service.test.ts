import assert from "node:assert/strict";
import {
  A1Service,
  type ArchivedReportSummary,
  LocationService,
  ReportService,
  SessionService,
  defaultA1Config,
  defaultSessionServiceConfig,
  type A1Config,
  type BuiltReportData,
  type LocationGroup,
  type LocationGroupRepository,
  type Report,
  type ReportRecord,
  type ReportRepository,
  type ReportTagMetadata,
  type StudyLocation,
  type StudyLocationRepository,
  type User,
  type UserRepository,
} from "../shared/src/uml_service_layout";

const registeredTests: Array<{ name: string; run: () => Promise<void> | void }> = [];
const suiteStack: string[] = [];

function describe(name: string, fn: () => void): void {
  suiteStack.push(name);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

function it(name: string, fn: () => Promise<void> | void): void {
  registeredTests.push({
    name: [...suiteStack, name].join(" > "),
    run: fn,
  });
}

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: User[]) {}

  async createUser(userData: unknown): Promise<User> {
    return userData as User;
  }

  async updateUser(user: User): Promise<User> {
    const index = this.users.findIndex((candidate) => candidate.userId === user.userId);
    if (index >= 0) {
      this.users[index] = { ...user };
    } else {
      this.users.push({ ...user });
    }

    return user;
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.users.find((user) => user.userId === userId) ?? null;
  }

  async findUsersByIds(userIds: string[]): Promise<User[]> {
    return this.users
      .filter((user) => userIds.includes(user.userId))
      .map((user) => ({ ...user }));
  }

  async verifyEmail(_token: string): Promise<User | null> {
    return null;
  }

  async generateResetToken(_email: string): Promise<boolean> {
    return true;
  }

  async resetPassword(_token: string, _newPassword: string): Promise<boolean> {
    return true;
  }

  async authenticate(_loginData: unknown): Promise<{ user: User; token: string } | null> {
    return null;
  }

  snapshot(): User[] {
    return this.users.map((user) => ({ ...user }));
  }
}

class InMemoryReportRepository implements ReportRepository {
  constructor(private readonly records: ReportRecord[]) {}

  async createReport(reportData: BuiltReportData): Promise<Report> {
    const report: Report = {
      reportId: `report-${this.records.length + 1}`,
      reportKind: "live",
      ...reportData,
    };
    this.records.push({ report });
    return report;
  }

  async getRecentReports(): Promise<ReportRecord[]> {
    return this.records
      .filter((record) => record.report.reportKind === "live")
      .map(cloneRecord);
  }

  async getReportsByLocation(studyLocationId: string): Promise<ReportRecord[]> {
    return this.records
      .filter(
        (record) =>
          record.report.studyLocationId === studyLocationId &&
          record.report.reportKind === "live",
      )
      .map(cloneRecord);
  }

  async getAllReportsWithMetadata(): Promise<ReportRecord[]> {
    return this.records
      .filter((record) => record.report.reportKind === "live")
      .map(cloneRecord);
  }

  async upsertReportMetadata(records: ReportTagMetadata[]): Promise<void> {
    for (const metadata of records) {
      const record = this.records.find((candidate) => candidate.report.reportId === metadata.reportId);
      if (record) {
        record.metadata = { ...metadata };
      }
    }
  }

  async createArchivedReports(records: ArchivedReportSummary[]): Promise<void> {
    for (const archivedSummary of records) {
      const existing = this.records.find(
        (candidate) => candidate.report.reportId === archivedSummary.reportId,
      );

      const archivedRecord = {
        report: archivedSummary as unknown as Report,
      };

      if (existing) {
        existing.report = archivedRecord.report;
        delete existing.metadata;
      } else {
        this.records.push(archivedRecord);
      }
    }
  }

  async deleteReports(reportIds: string[]): Promise<void> {
    for (const reportId of reportIds) {
      const index = this.records.findIndex((record) => record.report.reportId === reportId);
      if (index >= 0) {
        this.records.splice(index, 1);
      }
    }
  }

  snapshot(): ReportRecord[] {
    return this.records.map(cloneRecord);
  }
}

class InMemoryStudyLocationRepository implements StudyLocationRepository {
  constructor(private readonly locations: StudyLocation[]) {}

  async getAllStudyLocations(): Promise<StudyLocation[]> {
    return this.locations.map((location) => ({ ...location }));
  }

  async getStudyLocationById(studyLocationId: string): Promise<StudyLocation | null> {
    const location = this.locations.find((candidate) => candidate.studyLocationId === studyLocationId);
    return location ? { ...location } : null;
  }

  async updateStudyLocation(location: StudyLocation): Promise<StudyLocation> {
    const index = this.locations.findIndex(
      (candidate) => candidate.studyLocationId === location.studyLocationId,
    );
    if (index >= 0) {
      this.locations[index] = { ...location };
    } else {
      this.locations.push({ ...location });
    }

    return location;
  }

  async bulkUpdateStudyLocations(locations: StudyLocation[]): Promise<void> {
    for (const location of locations) {
      await this.updateStudyLocation(location);
    }
  }

  snapshot(): StudyLocation[] {
    return this.locations.map((location) => ({ ...location }));
  }
}

class InMemoryLocationGroupRepository implements LocationGroupRepository {
  constructor(private readonly groups: LocationGroup[]) {}

  async getAllLocationGroups(): Promise<LocationGroup[]> {
    return this.groups.map((group) => ({ ...group }));
  }

  async getLocationGroupById(locationGroupId: string): Promise<LocationGroup | null> {
    const group = this.groups.find((candidate) => candidate.locationGroupId === locationGroupId);
    return group ? { ...group } : null;
  }

  async updateLocationGroup(group: LocationGroup): Promise<LocationGroup> {
    const index = this.groups.findIndex(
      (candidate) => candidate.locationGroupId === group.locationGroupId,
    );
    if (index >= 0) {
      this.groups[index] = { ...group };
    } else {
      this.groups.push({ ...group });
    }

    return group;
  }

  async bulkUpdateLocationGroups(groups: LocationGroup[]): Promise<void> {
    for (const group of groups) {
      await this.updateLocationGroup(group);
    }
  }

  snapshot(): LocationGroup[] {
    return this.groups.map((group) => ({ ...group }));
  }
}

describe("LocationService.getClosestLocation", () => {
  it("returns the nearest study location within the allowed distance", async () => {
    const locationService = new LocationService(
      new InMemoryStudyLocationRepository([
        makeLocation("loc-a", "group-1", 28.6024, -81.2001),
        makeLocation("loc-b", "group-1", 28.6029, -81.1995),
      ]),
      new InMemoryLocationGroupRepository([makeGroup("group-1")]),
      150,
    );

    const closest = await locationService.getClosestLocation({
      latitude: 28.60245,
      longitude: -81.20005,
    });

    assert.equal(closest.studyLocationId, "loc-a");
  });

  it("throws when no location is within the resolution threshold", async () => {
    const locationService = new LocationService(
      new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.60, -81.20)]),
      new InMemoryLocationGroupRepository([makeGroup("group-1")]),
      25,
    );

    await assert.rejects(
      () =>
        locationService.getClosestLocation({
          latitude: 28.605,
          longitude: -81.205,
        }),
      /No study location found within the allowed resolution distance/,
    );
  });
});

describe("SessionService.buildReport", () => {
  it("builds a report from sanitized, smoothed, and winsorized noise samples", async () => {
    const sessionService = new SessionService(
      new LocationService(
        new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.6024, -81.2001)]),
        new InMemoryLocationGroupRepository([makeGroup("group-1")]),
      ),
      new InMemoryUserRepository([makeUser("user-1")]),
      defaultSessionServiceConfig,
    );

    const sessionState = await sessionService.initializeSession(
      "user-1",
      { latitude: 28.6024, longitude: -81.2001 },
    );

    for (const reading of [45, 46, 47, 50, 49, 48, 47, 46, 45, 44, 43, 90]) {
      sessionService.getDecibelReading(sessionState, reading);
    }
    sessionService.updateOccupancy(sessionState, 4);

    const report = sessionService.buildReport(sessionState);

    assert.equal(report.studyLocationId, "loc-a");
    assert.equal(report.occupancy, 4);
    assert.ok(Math.abs(report.avgNoise - 46.9775) < 0.0001);
    assert.ok(Math.abs(report.maxNoise - 50.63) < 0.01);
    assert.ok(report.variance > 0);
  });

  it("rejects report creation when too few valid samples are present", async () => {
    const sessionService = new SessionService(
      new LocationService(
        new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.6024, -81.2001)]),
        new InMemoryLocationGroupRepository([makeGroup("group-1")]),
      ),
      new InMemoryUserRepository([makeUser("user-1")]),
      defaultSessionServiceConfig,
    );

    const sessionState = await sessionService.initializeSession("user-1", {
      latitude: 28.6024,
      longitude: -81.2001,
    });

    for (const reading of [45, 46, 47, 48]) {
      sessionService.getDecibelReading(sessionState, reading);
    }
    sessionService.updateOccupancy(sessionState, 3);

    assert.throws(
      () => sessionService.buildReport(sessionState),
      /At least 10 valid noise samples are required/,
    );
  });
});

describe("A1Service.evaluateReportMetadata", () => {
  it("combines decay, variance correction, neutral session correction, and user trust into metadata", () => {
    const { service, user } = createA1Harness({
      users: [makeUser("user-1", { userNoiseWF: 0.8, userOccupancyWF: 1.1 })],
    });

    const now = new Date("2026-03-27T12:00:00.000Z");
    const report = makeReport("report-main", "user-1", "loc-a", {
      createdAt: new Date("2026-03-27T11:58:00.000Z"),
      avgNoise: 60,
      variance: 10,
      occupancy: 4,
    });

    const history: ReportRecord[] = [
      { report },
      {
        report: makeReport("report-peer-1", "user-2", "loc-a", {
          createdAt: new Date("2026-03-27T11:57:00.000Z"),
          avgNoise: 62,
          variance: 6,
          occupancy: 3,
        }),
      },
      {
        report: makeReport("report-peer-2", "user-3", "loc-a", {
          createdAt: new Date("2026-03-27T11:54:00.000Z"),
          avgNoise: 58,
          variance: 6,
          occupancy: 3,
        }),
      },
      {
        report: makeReport("report-historical", "user-4", "loc-a", {
          createdAt: new Date("2026-03-20T11:50:00.000Z"),
          avgNoise: 59,
          variance: 8,
          occupancy: 2,
        }),
      },
    ];

    const metadata = service.evaluateReportMetadata(report, history, user, now);

    assert.ok(Math.abs(metadata.decayFactor - 0.7579) < 0.001);
    assert.ok(Math.abs(metadata.varianceCorrectionWF - 0.7142) < 0.001);
    assert.equal(metadata.sessionCorrectionNoiseWF, 1.0);
    assert.ok(Math.abs(metadata.noiseWeightFactor - 0.433) < 0.02);
    assert.ok(Math.abs(metadata.occupancyWeightFactor - 0.83) < 0.02);
  });

  it("keeps session correction neutral for processed-only reports", () => {
    const { service, user } = createA1Harness({
      users: [makeUser("user-1", { userNoiseWF: 0.8, userOccupancyWF: 1.1 })],
    });

    const report = makeReport("report-main", "user-1", "loc-a", {
      createdAt: new Date("2026-03-27T11:58:00.000Z"),
      avgNoise: 60,
      variance: 10,
      occupancy: 4,
    });

    const history: ReportRecord[] = [
      { report },
      {
        report: makeReport("report-peer-1", "user-2", "loc-a", {
          createdAt: new Date("2026-03-27T11:57:00.000Z"),
          avgNoise: 62,
          variance: 6,
          occupancy: 3,
        }),
      },
      {
        report: makeReport("report-peer-2", "user-3", "loc-a", {
          createdAt: new Date("2026-03-27T11:54:00.000Z"),
          avgNoise: 58,
          variance: 6,
          occupancy: 3,
        }),
      },
      {
        report: makeReport("report-historical", "user-4", "loc-a", {
          createdAt: new Date("2026-03-20T11:50:00.000Z"),
          avgNoise: 59,
          variance: 8,
          occupancy: 2,
        }),
      },
    ];

    const metadata = service.evaluateReportMetadata(report, history, user, referenceNow());

    assert.equal(metadata.sessionCorrectionNoiseWF, 1.0);
  });
});

describe("A1Service location and group status updates", () => {
  it("recalculates a location using weighted active reports", async () => {
    const now = new Date();
    const harness = createA1Harness({
      users: [makeUser("user-1"), makeUser("user-2")],
      reports: [
        {
          report: makeReport("report-1", "user-1", "loc-a", {
            createdAt: minutesBefore(now, 1),
            avgNoise: 40,
            variance: 0,
            occupancy: 2,
          }),
        },
        {
          report: makeReport("report-2", "user-2", "loc-a", {
            createdAt: minutesBefore(now, 2),
            avgNoise: 60,
            variance: 0,
            occupancy: 4,
          }),
        },
      ],
    });

    await harness.service.recalculateLocationStatus("loc-a");

    const updatedLocation = harness.studyLocationRepository.snapshot()[0];
    const weight1 = decayWeight(1);
    const weight2 = decayWeight(2);
    const expectedNoise = (40 * weight1 + 60 * weight2) / (weight1 + weight2);
    const expectedOccupancy = (2 * weight1 + 4 * weight2) / (weight1 + weight2);
    assert.ok(Math.abs((updatedLocation.currentNoiseLevel ?? 0) - expectedNoise) < 0.2);
    assert.ok(Math.abs((updatedLocation.currentOccupancyLevel ?? 0) - expectedOccupancy) < 0.2);
    assert.notEqual(updatedLocation.updatedAt, null);
    assert.ok((updatedLocation.updatedAt as Date).getTime() >= now.getTime() - 60_000);
  });

  it("updates a group using location recency weighting", async () => {
    const now = new Date();
    const harness = createA1Harness({
      locations: [
        makeLocation("loc-a", "group-1", 28.6024, -81.2001, {
          currentNoiseLevel: 40,
          currentOccupancyLevel: 2,
          updatedAt: secondsBefore(now, 30),
        }),
        makeLocation("loc-b", "group-1", 28.6030, -81.1990, {
          currentNoiseLevel: 70,
          currentOccupancyLevel: 5,
          updatedAt: secondsBefore(now, 150),
        }),
      ],
    });

    await harness.service.updateGroupStatus("group-1");

    const updatedGroup = harness.locationGroupRepository.snapshot()[0];
    const recencyWeightA = (180 - 30) / 180;
    const recencyWeightB = (180 - 150) / 180;
    const expectedNoise =
      (40 * recencyWeightA + 70 * recencyWeightB) / (recencyWeightA + recencyWeightB);
    const expectedOccupancy =
      (2 * recencyWeightA + 5 * recencyWeightB) / (recencyWeightA + recencyWeightB);
    assert.ok(Math.abs((updatedGroup.currentNoiseLevel ?? 0) - expectedNoise) < 0.5);
    assert.ok(Math.abs((updatedGroup.currentOccupancyLevel ?? 0) - expectedOccupancy) < 0.5);
    assert.ok(updatedGroup.updatedAt instanceof Date);
  });
});

describe("A1Service trust updates", () => {
  it("penalizes occupancy overreporting more than equivalent underreporting", async () => {
    const overHarness = createA1Harness({
      users: [makeUser("over-user")],
      reports: [
        { report: makeReport("over-1", "over-user", "loc-a", { occupancy: 5, avgNoise: 50 }) },
        { report: makeReport("over-2", "over-user", "loc-a", { occupancy: 5, avgNoise: 50, createdAt: minutesAgo(1) }) },
        { report: makeReport("over-3", "over-user", "loc-a", { occupancy: 5, avgNoise: 50, createdAt: minutesAgo(2) }) },
        { report: makeReport("baseline-over", "peer-1", "loc-a", { occupancy: 1, avgNoise: 50, createdAt: minutesAgo(3) }) },
      ],
    });

    const underHarness = createA1Harness({
      users: [makeUser("under-user")],
      reports: [
        { report: makeReport("under-1", "under-user", "loc-a", { occupancy: 1, avgNoise: 50 }) },
        { report: makeReport("under-2", "under-user", "loc-a", { occupancy: 1, avgNoise: 50, createdAt: minutesAgo(1) }) },
        { report: makeReport("under-3", "under-user", "loc-a", { occupancy: 1, avgNoise: 50, createdAt: minutesAgo(2) }) },
        { report: makeReport("baseline-under", "peer-1", "loc-a", { occupancy: 5, avgNoise: 50, createdAt: minutesAgo(3) }) },
      ],
    });

    const overResult = await overHarness.service.runPollingCycle(referenceNow());
    const underResult = await underHarness.service.runPollingCycle(referenceNow());

    const overUser = overResult.updatedUsers.find((user) => user.userId === "over-user");
    const underUser = underResult.updatedUsers.find((user) => user.userId === "under-user");

    assert.ok((overUser?.userOccupancyWF ?? 1) < 1);
    assert.ok((underUser?.userOccupancyWF ?? 1) > 1);
    assert.ok(1 - (overUser?.userOccupancyWF ?? 1) > (underUser?.userOccupancyWF ?? 1) - 1);
  });

  it("penalizes noise underreporting more than equivalent overreporting", async () => {
    const overHarness = createA1Harness({
      users: [makeUser("loud-user")],
      reports: [
        { report: makeReport("loud-1", "loud-user", "loc-a", { avgNoise: 60, occupancy: 3 }) },
        { report: makeReport("loud-2", "loud-user", "loc-a", { avgNoise: 60, occupancy: 3, createdAt: minutesAgo(1) }) },
        { report: makeReport("loud-3", "loud-user", "loc-a", { avgNoise: 60, occupancy: 3, createdAt: minutesAgo(2) }) },
        { report: makeReport("baseline-loud", "peer-1", "loc-a", { avgNoise: 48, occupancy: 3, createdAt: minutesAgo(3) }) },
      ],
    });

    const underHarness = createA1Harness({
      users: [makeUser("quiet-user")],
      reports: [
        { report: makeReport("quiet-1", "quiet-user", "loc-a", { avgNoise: 48, occupancy: 3 }) },
        { report: makeReport("quiet-2", "quiet-user", "loc-a", { avgNoise: 48, occupancy: 3, createdAt: minutesAgo(1) }) },
        { report: makeReport("quiet-3", "quiet-user", "loc-a", { avgNoise: 48, occupancy: 3, createdAt: minutesAgo(2) }) },
        { report: makeReport("baseline-quiet", "peer-1", "loc-a", { avgNoise: 60, occupancy: 3, createdAt: minutesAgo(3) }) },
      ],
    });

    const overResult = await overHarness.service.runPollingCycle(referenceNow());
    const underResult = await underHarness.service.runPollingCycle(referenceNow());

    const loudUser = overResult.updatedUsers.find((user) => user.userId === "loud-user");
    const quietUser = underResult.updatedUsers.find((user) => user.userId === "quiet-user");

    assert.ok((loudUser?.userNoiseWF ?? 1) < 1);
    assert.ok((quietUser?.userNoiseWF ?? 1) > 1);
    assert.ok((quietUser?.userNoiseWF ?? 1) - 1 > 1 - (loudUser?.userNoiseWF ?? 1));
  });
});

describe("A1Service stale report pruning", () => {
  it("deletes reports whose decay falls below the minimum threshold", async () => {
    const harness = createA1Harness({
      reports: [
        {
          report: makeReport("stale-report", "user-1", "loc-a", {
            createdAt: hoursAgo(2),
          }),
        },
        {
          report: makeReport("fresh-report", "user-1", "loc-a", {
            createdAt: minutesAgoFromCurrent(1),
          }),
        },
      ],
    });

    await harness.service.pruneExpiredReports("loc-a");

    const remainingIds = harness.reportRepository
      .snapshot()
      .map((record) => record.report.reportId);
    assert.deepEqual(remainingIds, ["fresh-report"]);
  });
});

describe("A1Service polling cycle", () => {
  it("persists metadata, updates statuses, and skips users without enough samples", async () => {
    const harness = createA1Harness({
      users: [makeUser("user-1")],
      reports: [
        {
          report: makeReport("report-1", "user-1", "loc-a", {
            createdAt: new Date("2026-03-27T11:59:00.000Z"),
            avgNoise: 52,
            occupancy: 3,
          }),
        },
      ],
    });

    const result = await harness.service.runPollingCycle(referenceNow());
    const storedRecord = harness.reportRepository.snapshot()[0];

    assert.equal(result.activeReportCount, 1);
    assert.ok(storedRecord.metadata);
    assert.ok((storedRecord.metadata?.noiseWeightFactor ?? 0) > 0);
    assert.deepEqual(result.updatedUsers, []);
  });
});

describe("ReportService.submitNewReport", () => {
  it("accepts a ReportSubmission and initializes metadata immediately", async () => {
    const harness = createA1Harness({
      users: [makeUser("user-1")],
    });
    const reportService = new ReportService(harness.reportRepository, harness.service);

    const report = await reportService.submitNewReport({
      userId: "user-1",
      studyLocationId: "loc-a",
      avgNoise: 52,
      maxNoise: 56,
      variance: 8,
      occupancy: 3,
      createdAt: referenceNow(),
    });

    const storedRecord = harness.reportRepository
      .snapshot()
      .find((candidate) => candidate.report.reportId === report.reportId);

    assert.ok(storedRecord);
    assert.equal(storedRecord?.report.avgNoise, 52);
    assert.ok(storedRecord?.metadata);
    assert.equal(storedRecord?.metadata?.reportId, report.reportId);
    assert.equal(storedRecord?.metadata?.lastEvaluatedAt.toISOString(), report.createdAt.toISOString());
  });
});

function createA1Harness(input?: {
  config?: Partial<A1Config>;
  users?: User[];
  reports?: ReportRecord[];
  locations?: StudyLocation[];
  groups?: LocationGroup[];
}) {
  const config: A1Config = {
    ...defaultA1Config,
    ...(input?.config ?? {}),
  };
  const userRepository = new InMemoryUserRepository(input?.users ?? [makeUser("user-1")]);
  const reportRepository = new InMemoryReportRepository(input?.reports ?? []);
  const studyLocationRepository = new InMemoryStudyLocationRepository(
    input?.locations ?? [makeLocation("loc-a", "group-1", 28.6024, -81.2001)],
  );
  const locationGroupRepository = new InMemoryLocationGroupRepository(
    input?.groups ?? [makeGroup("group-1")],
  );
  const service = new A1Service(
    reportRepository,
    userRepository,
    studyLocationRepository,
    locationGroupRepository,
    config,
  );

  return {
    config,
    service,
    user: userRepository.snapshot()[0],
    userRepository,
    reportRepository,
    studyLocationRepository,
    locationGroupRepository,
  };
}

function makeUser(
  userId: string,
  overrides?: Partial<User>,
): User {
  return {
    userId,
    userNoiseWF: 1,
    userOccupancyWF: 1,
    ...overrides,
  };
}

function makeLocation(
  studyLocationId: string,
  locationGroupId: string,
  latitude: number,
  longitude: number,
  overrides?: Partial<StudyLocation>,
): StudyLocation {
  return {
    studyLocationId,
    locationGroupId,
    name: studyLocationId,
    latitude,
    longitude,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeGroup(locationGroupId: string, overrides?: Partial<LocationGroup>): LocationGroup {
  return {
    locationGroupId,
    name: locationGroupId,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeReport(
  reportId: string,
  userId: string,
  studyLocationId: string,
  overrides?: Partial<Report>,
): Report {
  return {
    reportId,
    reportKind: "live",
    userId,
    studyLocationId,
    createdAt: referenceNow(),
    avgNoise: 50,
    maxNoise: 55,
    variance: 4,
    occupancy: 3,
    ...overrides,
  };
}

function cloneRecord(record: ReportRecord): ReportRecord {
  return {
    report: {
      ...record.report,
      createdAt: new Date(record.report.createdAt),
    },
    metadata: record.metadata
      ? {
          ...record.metadata,
          lastEvaluatedAt: new Date(record.metadata.lastEvaluatedAt),
        }
      : undefined,
  };
}

function referenceNow(): Date {
  return new Date("2026-03-27T12:00:00.000Z");
}

function minutesAgo(minutes: number): Date {
  return new Date(referenceNow().getTime() - minutes * 60_000);
}

function minutesBefore(base: Date, minutes: number): Date {
  return new Date(base.getTime() - minutes * 60_000);
}

function secondsBefore(base: Date, seconds: number): Date {
  return new Date(base.getTime() - seconds * 1_000);
}

function minutesAgoFromCurrent(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60_000);
}

function decayWeight(ageMinutes: number): number {
  const halfLifeMinutes = defaultA1Config.reportHalfLifeMs / 60_000;
  return Math.exp(-(Math.log(2) / halfLifeMinutes) * ageMinutes);
}

void runRegisteredTests();

async function runRegisteredTests(): Promise<void> {
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

  console.log(`All ${registeredTests.length} unit tests passed.`);
}
