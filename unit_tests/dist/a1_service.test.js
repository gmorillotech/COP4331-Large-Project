"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const support_services_1 = require("../shared/src/support_services");
const uml_service_layout_1 = require("../shared/src/uml_service_layout");
const registeredTests = [];
const suiteStack = [];
function describe(name, fn) {
    suiteStack.push(name);
    try {
        fn();
    }
    finally {
        suiteStack.pop();
    }
}
function it(name, fn) {
    registeredTests.push({
        name: [...suiteStack, name].join(" > "),
        run: fn,
    });
}
class InMemoryUserRepository {
    users;
    constructor(users) {
        this.users = users;
    }
    async createUser(userData) {
        return userData;
    }
    async updateUser(user) {
        const index = this.users.findIndex((candidate) => candidate.userId === user.userId);
        if (index >= 0) {
            this.users[index] = { ...user };
        }
        else {
            this.users.push({ ...user });
        }
        return user;
    }
    async findUserById(userId) {
        return this.users.find((user) => user.userId === userId) ?? null;
    }
    async findUsersByIds(userIds) {
        return this.users
            .filter((user) => userIds.includes(user.userId))
            .map((user) => ({ ...user }));
    }
    async verifyEmail(_token) {
        return null;
    }
    async generateResetToken(_email) {
        return true;
    }
    async resetPassword(_token, _newPassword) {
        return true;
    }
    async authenticate(_loginData) {
        return null;
    }
    snapshot() {
        return this.users.map((user) => ({ ...user }));
    }
}
class InMemoryReportRepository {
    records;
    constructor(records) {
        this.records = records;
    }
    async createReport(reportData) {
        const report = {
            reportId: `report-${this.records.length + 1}`,
            ...reportData,
        };
        this.records.push({ report });
        return report;
    }
    async getRecentReports() {
        return this.records.map(cloneRecord);
    }
    async getReportsByLocation(studyLocationId) {
        return this.records
            .filter((record) => record.report.studyLocationId === studyLocationId)
            .map(cloneRecord);
    }
    async getAllReportsWithMetadata() {
        return this.records.map(cloneRecord);
    }
    async upsertReportMetadata(records) {
        for (const metadata of records) {
            const record = this.records.find((candidate) => candidate.report.reportId === metadata.reportId);
            if (record) {
                record.metadata = { ...metadata };
            }
        }
    }
    async deleteReports(reportIds) {
        for (const reportId of reportIds) {
            const index = this.records.findIndex((record) => record.report.reportId === reportId);
            if (index >= 0) {
                this.records.splice(index, 1);
            }
        }
    }
    snapshot() {
        return this.records.map(cloneRecord);
    }
}
class InMemoryStudyLocationRepository {
    locations;
    constructor(locations) {
        this.locations = locations;
    }
    async getAllStudyLocations() {
        return this.locations.map((location) => ({ ...location }));
    }
    async getStudyLocationById(studyLocationId) {
        const location = this.locations.find((candidate) => candidate.studyLocationId === studyLocationId);
        return location ? { ...location } : null;
    }
    async updateStudyLocation(location) {
        const index = this.locations.findIndex((candidate) => candidate.studyLocationId === location.studyLocationId);
        if (index >= 0) {
            this.locations[index] = { ...location };
        }
        else {
            this.locations.push({ ...location });
        }
        return location;
    }
    async bulkUpdateStudyLocations(locations) {
        for (const location of locations) {
            await this.updateStudyLocation(location);
        }
    }
    snapshot() {
        return this.locations.map((location) => ({ ...location }));
    }
}
class InMemoryLocationGroupRepository {
    groups;
    constructor(groups) {
        this.groups = groups;
    }
    async getAllLocationGroups() {
        return this.groups.map((group) => ({ ...group }));
    }
    async getLocationGroupById(locationGroupId) {
        const group = this.groups.find((candidate) => candidate.locationGroupId === locationGroupId);
        return group ? { ...group } : null;
    }
    async updateLocationGroup(group) {
        const index = this.groups.findIndex((candidate) => candidate.locationGroupId === group.locationGroupId);
        if (index >= 0) {
            this.groups[index] = { ...group };
        }
        else {
            this.groups.push({ ...group });
        }
        return group;
    }
    async bulkUpdateLocationGroups(groups) {
        for (const group of groups) {
            await this.updateLocationGroup(group);
        }
    }
    snapshot() {
        return this.groups.map((group) => ({ ...group }));
    }
}
describe("LocationService.getClosestLocation", () => {
    it("returns the nearest study location within the allowed distance", async () => {
        const locationService = new uml_service_layout_1.LocationService(new InMemoryStudyLocationRepository([
            makeLocation("loc-a", "group-1", 28.6024, -81.2001),
            makeLocation("loc-b", "group-1", 28.6029, -81.1995),
        ]), new InMemoryLocationGroupRepository([makeGroup("group-1")]), 150);
        const closest = await locationService.getClosestLocation({
            latitude: 28.60245,
            longitude: -81.20005,
        });
        strict_1.default.equal(closest.studyLocationId, "loc-a");
    });
    it("throws when no location is within the resolution threshold", async () => {
        const locationService = new uml_service_layout_1.LocationService(new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.60, -81.20)]), new InMemoryLocationGroupRepository([makeGroup("group-1")]), 25);
        await strict_1.default.rejects(() => locationService.getClosestLocation({
            latitude: 28.605,
            longitude: -81.205,
        }), /No study location found within the allowed resolution distance/);
    });
});
describe("SessionService.buildReport", () => {
    it("builds a report from sanitized, smoothed, and winsorized noise samples", async () => {
        const sessionService = new uml_service_layout_1.SessionService(new uml_service_layout_1.LocationService(new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.6024, -81.2001)]), new InMemoryLocationGroupRepository([makeGroup("group-1")])), new InMemoryUserRepository([makeUser("user-1")]), uml_service_layout_1.defaultSessionServiceConfig);
        const sessionState = await sessionService.initializeSession("user-1", { latitude: 28.6024, longitude: -81.2001 }, "device-1");
        for (const reading of [45, 46, 47, 50, 49, 48, 47, 46, 45, 44, 43, 90]) {
            sessionService.getDecibelReading(sessionState, reading);
        }
        sessionService.updateOccupancy(sessionState, 4);
        const report = sessionService.buildReport(sessionState);
        strict_1.default.equal(report.studyLocationId, "loc-a");
        strict_1.default.equal(report.occupancy, 4);
        strict_1.default.ok(Math.abs(report.avgNoise - 46.9775) < 0.0001);
        strict_1.default.ok(Math.abs(report.maxNoise - 50.63) < 0.01);
        strict_1.default.ok(report.variance > 0);
    });
    it("rejects report creation when too few valid samples are present", async () => {
        const sessionService = new uml_service_layout_1.SessionService(new uml_service_layout_1.LocationService(new InMemoryStudyLocationRepository([makeLocation("loc-a", "group-1", 28.6024, -81.2001)]), new InMemoryLocationGroupRepository([makeGroup("group-1")])), new InMemoryUserRepository([makeUser("user-1")]), uml_service_layout_1.defaultSessionServiceConfig);
        const sessionState = await sessionService.initializeSession("user-1", {
            latitude: 28.6024,
            longitude: -81.2001,
        });
        for (const reading of [45, 46, 47, 48]) {
            sessionService.getDecibelReading(sessionState, reading);
        }
        sessionService.updateOccupancy(sessionState, 3);
        strict_1.default.throws(() => sessionService.buildReport(sessionState), /At least 10 valid noise samples are required/);
    });
});
describe("A1Service.evaluateReportMetadata", () => {
    it("combines decay, variance correction, session correction, and user trust into metadata", () => {
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
        const history = [
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
        strict_1.default.ok(Math.abs(metadata.decayFactor - 0.7579) < 0.001);
        strict_1.default.ok(Math.abs(metadata.varianceCorrectionWF - 0.7142) < 0.001);
        strict_1.default.ok(Math.abs(metadata.sessionCorrectionNoiseWF - 0.9047619) < 0.0001);
        strict_1.default.ok(Math.abs(metadata.noiseWeightFactor - 0.4) < 0.05);
        strict_1.default.ok(Math.abs(metadata.occupancyWeightFactor - 0.83) < 0.02);
    });
    it("matches the extracted support-services session correction diagnostics", () => {
        const { service, user } = createA1Harness({
            users: [makeUser("user-1", { userNoiseWF: 0.8, userOccupancyWF: 1.1 })],
        });
        const report = makeReport("report-main", "user-1", "loc-a", {
            createdAt: new Date("2026-03-27T11:58:00.000Z"),
            avgNoise: 60,
            variance: 10,
            occupancy: 4,
        });
        const history = [
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
        const supportDiagnostics = new support_services_1.SessionCorrectionService(support_services_1.defaultSessionCorrectionServiceConfig).evaluate({
            report,
            reportHistory: history.map((record) => record.report),
            user,
            now: report.createdAt,
        });
        strict_1.default.equal(metadata.sessionCorrectionNoiseWF, supportDiagnostics.sessionCorrectionNoiseWF);
        strict_1.default.ok(Math.abs(supportDiagnostics.historicalScore - 0.9285714285714286) < 1e-12);
        strict_1.default.ok(Math.abs(supportDiagnostics.userScore - 0.6666666666666666) < 1e-12);
        strict_1.default.ok(Math.abs(supportDiagnostics.peerScore - 1.0) < 1e-12);
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
        strict_1.default.ok(Math.abs((updatedLocation.currentNoiseLevel ?? 0) - expectedNoise) < 0.2);
        strict_1.default.ok(Math.abs((updatedLocation.currentOccupancyLevel ?? 0) - expectedOccupancy) < 0.2);
        strict_1.default.notEqual(updatedLocation.updatedAt, null);
        strict_1.default.ok(updatedLocation.updatedAt.getTime() >= now.getTime() - 60_000);
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
        const expectedNoise = (40 * recencyWeightA + 70 * recencyWeightB) / (recencyWeightA + recencyWeightB);
        const expectedOccupancy = (2 * recencyWeightA + 5 * recencyWeightB) / (recencyWeightA + recencyWeightB);
        strict_1.default.ok(Math.abs((updatedGroup.currentNoiseLevel ?? 0) - expectedNoise) < 0.5);
        strict_1.default.ok(Math.abs((updatedGroup.currentOccupancyLevel ?? 0) - expectedOccupancy) < 0.5);
        strict_1.default.ok(updatedGroup.updatedAt instanceof Date);
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
        strict_1.default.ok((overUser?.userOccupancyWF ?? 1) < 1);
        strict_1.default.ok((underUser?.userOccupancyWF ?? 1) > 1);
        strict_1.default.ok(1 - (overUser?.userOccupancyWF ?? 1) > (underUser?.userOccupancyWF ?? 1) - 1);
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
        strict_1.default.ok((loudUser?.userNoiseWF ?? 1) < 1);
        strict_1.default.ok((quietUser?.userNoiseWF ?? 1) > 1);
        strict_1.default.ok((quietUser?.userNoiseWF ?? 1) - 1 > 1 - (loudUser?.userNoiseWF ?? 1));
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
        strict_1.default.deepEqual(remainingIds, ["fresh-report"]);
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
        strict_1.default.equal(result.activeReportCount, 1);
        strict_1.default.ok(storedRecord.metadata);
        strict_1.default.ok((storedRecord.metadata?.noiseWeightFactor ?? 0) > 0);
        strict_1.default.deepEqual(result.updatedUsers, []);
    });
});
describe("ReportService.submitNewReport", () => {
    it("accepts a ReportSubmission and initializes metadata immediately", async () => {
        const harness = createA1Harness({
            users: [makeUser("user-1")],
        });
        const reportService = new uml_service_layout_1.ReportService(harness.reportRepository, harness.service);
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
        strict_1.default.ok(storedRecord);
        strict_1.default.equal(storedRecord?.report.avgNoise, 52);
        strict_1.default.ok(storedRecord?.metadata);
        strict_1.default.equal(storedRecord?.metadata?.reportId, report.reportId);
        strict_1.default.equal(storedRecord?.metadata?.lastEvaluatedAt.toISOString(), report.createdAt.toISOString());
    });
});
function createA1Harness(input) {
    const config = {
        ...uml_service_layout_1.defaultA1Config,
        ...(input?.config ?? {}),
    };
    const userRepository = new InMemoryUserRepository(input?.users ?? [makeUser("user-1")]);
    const reportRepository = new InMemoryReportRepository(input?.reports ?? []);
    const studyLocationRepository = new InMemoryStudyLocationRepository(input?.locations ?? [makeLocation("loc-a", "group-1", 28.6024, -81.2001)]);
    const locationGroupRepository = new InMemoryLocationGroupRepository(input?.groups ?? [makeGroup("group-1")]);
    const service = new uml_service_layout_1.A1Service(reportRepository, userRepository, studyLocationRepository, locationGroupRepository, config);
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
function makeUser(userId, overrides) {
    return {
        userId,
        userNoiseWF: 1,
        userOccupancyWF: 1,
        ...overrides,
    };
}
function makeLocation(studyLocationId, locationGroupId, latitude, longitude, overrides) {
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
function makeGroup(locationGroupId, overrides) {
    return {
        locationGroupId,
        name: locationGroupId,
        currentNoiseLevel: null,
        currentOccupancyLevel: null,
        updatedAt: null,
        ...overrides,
    };
}
function makeReport(reportId, userId, studyLocationId, overrides) {
    return {
        reportId,
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
function cloneRecord(record) {
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
function referenceNow() {
    return new Date("2026-03-27T12:00:00.000Z");
}
function minutesAgo(minutes) {
    return new Date(referenceNow().getTime() - minutes * 60_000);
}
function minutesBefore(base, minutes) {
    return new Date(base.getTime() - minutes * 60_000);
}
function secondsBefore(base, seconds) {
    return new Date(base.getTime() - seconds * 1_000);
}
function minutesAgoFromCurrent(minutes) {
    return new Date(Date.now() - minutes * 60_000);
}
function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60_000);
}
function decayWeight(ageMinutes) {
    const halfLifeMinutes = uml_service_layout_1.defaultA1Config.reportHalfLifeMs / 60_000;
    return Math.exp(-(Math.log(2) / halfLifeMinutes) * ageMinutes);
}
void runRegisteredTests();
async function runRegisteredTests() {
    let failures = 0;
    for (const testCase of registeredTests) {
        try {
            await testCase.run();
            console.log(`PASS ${testCase.name}`);
        }
        catch (error) {
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
