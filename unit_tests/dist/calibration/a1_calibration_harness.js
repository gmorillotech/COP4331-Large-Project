"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const uml_service_layout_1 = require("../../shared/src/uml_service_layout");
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
    insert(report) {
        this.records.push({ report: { ...report } });
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
async function main() {
    const config = loadConfigOverride();
    const summary = {
        evaluatedConfig: config,
        scenarios: {
            stepResponse: await runStepResponseScenario(config),
            outlierDamping: await runOutlierDampingScenario(config),
            trustDrift: await runTrustDriftScenario(config),
            decayTimeline: await runDecayTimelineScenario(config),
            groupRecency: await runGroupRecencyScenario(config),
        },
    };
    console.log(JSON.stringify(summary, null, 2));
}
async function runStepResponseScenario(config) {
    const start = new Date("2026-03-28T14:00:00.000Z");
    const harness = createHarness(config);
    const users = ["user-a", "user-b", "user-c"];
    const series = [];
    for (let minute = 0; minute <= 12; minute += 1) {
        const avgNoise = minute < 5 ? 45 : 65;
        for (const [index, userId] of users.entries()) {
            harness.reportRepository.insert(makeReport(`step-${minute}-${index}`, userId, "loc-a", {
                createdAt: minutesAfter(start, minute),
                avgNoise: avgNoise + (index - 1),
                maxNoise: avgNoise + 4,
                variance: 4,
                occupancy: 3,
            }));
        }
        const result = await harness.service.runPollingCycle(minutesAfter(start, minute));
        const location = result.updatedStudyLocations.find((candidate) => candidate.studyLocationId === "loc-a");
        series.push({
            minute,
            aggregateNoise: location?.currentNoiseLevel ?? null,
        });
    }
    const baseline = series[4].aggregateNoise ?? 0;
    const target = 65;
    const delta = target - baseline;
    return {
        baselineNoise: baseline,
        targetNoise: target,
        timeToHalfDeltaMinutes: firstMinuteAtOrAbove(series, baseline + delta * 0.5),
        timeToEightyPercentMinutes: firstMinuteAtOrAbove(series, baseline + delta * 0.8),
        finalNoise: series.at(-1)?.aggregateNoise ?? null,
        assessment: assessStepResponse(series, baseline, target),
        series,
    };
}
async function runOutlierDampingScenario(config) {
    const start = new Date("2026-03-28T15:00:00.000Z");
    const harness = createHarness(config);
    const baselineReports = [
        makeReport("peer-1", "user-a", "loc-a", {
            createdAt: start,
            avgNoise: 50,
            maxNoise: 55,
            variance: 3,
            occupancy: 3,
        }),
        makeReport("peer-2", "user-b", "loc-a", {
            createdAt: start,
            avgNoise: 51,
            maxNoise: 56,
            variance: 3,
            occupancy: 3,
        }),
        makeReport("peer-3", "user-c", "loc-a", {
            createdAt: start,
            avgNoise: 49,
            maxNoise: 54,
            variance: 3,
            occupancy: 3,
        }),
    ];
    const outlierReport = makeReport("outlier", "user-outlier", "loc-a", {
        createdAt: start,
        avgNoise: 92,
        maxNoise: 98,
        variance: 40,
        occupancy: 3,
    });
    for (const report of [...baselineReports, outlierReport]) {
        harness.reportRepository.insert(report);
    }
    const result = await harness.service.runPollingCycle(start);
    const location = result.updatedStudyLocations.find((candidate) => candidate.studyLocationId === "loc-a");
    const storedOutlier = harness.reportRepository.snapshot().find((record) => record.report.reportId === outlierReport.reportId);
    const baselineMean = average(baselineReports.map((report) => report.avgNoise));
    const aggregateNoise = location?.currentNoiseLevel ?? null;
    const dampingRatio = aggregateNoise === null ? null : (aggregateNoise - baselineMean) / (outlierReport.avgNoise - baselineMean);
    return {
        baselineMean,
        outlierNoise: outlierReport.avgNoise,
        aggregateNoise,
        dampingRatio,
        outlierMetadata: storedOutlier?.metadata ?? null,
        assessment: dampingRatio === null ? "unknown" : classifyDampingRatio(dampingRatio),
    };
}
async function runTrustDriftScenario(config) {
    const start = new Date("2026-03-28T16:00:00.000Z");
    const harness = createHarness(config, {
        users: [
            makeUser("stable-user"),
            makeUser("over-reporter"),
            makeUser("under-reporter"),
        ],
    });
    const series = [];
    for (let cycle = 0; cycle < 8; cycle += 1) {
        const timestamp = minutesAfter(start, cycle);
        harness.reportRepository.insert(makeReport(`stable-${cycle}`, "stable-user", "loc-a", {
            createdAt: timestamp,
            avgNoise: 55,
            maxNoise: 60,
            variance: 2,
            occupancy: 3,
        }));
        harness.reportRepository.insert(makeReport(`over-${cycle}`, "over-reporter", "loc-a", {
            createdAt: timestamp,
            avgNoise: 55,
            maxNoise: 60,
            variance: 2,
            occupancy: 5,
        }));
        harness.reportRepository.insert(makeReport(`under-${cycle}`, "under-reporter", "loc-a", {
            createdAt: timestamp,
            avgNoise: 47,
            maxNoise: 51,
            variance: 2,
            occupancy: 3,
        }));
        const result = await harness.service.runPollingCycle(timestamp);
        const users = indexByUserId(result.updatedUsers.length > 0 ? result.updatedUsers : harness.userRepository.snapshot());
        series.push({
            cycle,
            stableNoiseWF: users.get("stable-user")?.userNoiseWF ?? 1,
            overReporterOccupancyWF: users.get("over-reporter")?.userOccupancyWF ?? 1,
            underReporterNoiseWF: users.get("under-reporter")?.userNoiseWF ?? 1,
        });
    }
    const initial = series[0];
    const final = series.at(-1) ?? initial;
    return {
        maxPerCycleOccupancyShift: maxStepDelta(series.map((entry) => entry.overReporterOccupancyWF)),
        maxPerCycleNoiseShift: maxStepDelta(series.map((entry) => entry.underReporterNoiseWF)),
        finalOverReporterOccupancyWF: final.overReporterOccupancyWF,
        finalUnderReporterNoiseWF: final.underReporterNoiseWF,
        netOverReporterShift: final.overReporterOccupancyWF - initial.overReporterOccupancyWF,
        netUnderReporterShift: final.underReporterNoiseWF - initial.underReporterNoiseWF,
        assessment: assessTrustDrift(final, series),
        series,
    };
}
async function runDecayTimelineScenario(config) {
    const start = new Date("2026-03-28T17:00:00.000Z");
    const harness = createHarness(config, {
        locations: [
            makeLocation("loc-a", "group-1", {
                currentNoiseLevel: null,
                currentOccupancyLevel: null,
                updatedAt: null,
            }),
            makeLocation("loc-b", "group-1", {
                currentNoiseLevel: null,
                currentOccupancyLevel: null,
                updatedAt: null,
            }),
        ],
    });
    harness.reportRepository.insert(makeReport("decay-a", "user-a", "loc-a", {
        createdAt: start,
        avgNoise: 52,
        occupancy: 3,
    }));
    harness.reportRepository.insert(makeReport("decay-b", "user-b", "loc-b", {
        createdAt: start,
        avgNoise: 58,
        occupancy: 4,
    }));
    const series = [];
    for (let minute = 0; minute <= 30; minute += 1) {
        const evaluatedAt = minutesAfter(start, minute);
        const result = await harness.service.runPollingCycle(evaluatedAt);
        const locA = result.updatedStudyLocations.find((location) => location.studyLocationId === "loc-a");
        const locB = result.updatedStudyLocations.find((location) => location.studyLocationId === "loc-b");
        const group = result.updatedLocationGroups.find((candidate) => candidate.locationGroupId === "group-1");
        series.push({
            minute,
            locationANoise: locA?.currentNoiseLevel ?? null,
            locationBNoise: locB?.currentNoiseLevel ?? null,
            groupNoise: group?.currentNoiseLevel ?? null,
            activeReports: result.activeReportCount,
        });
    }
    const expectedDropMinute = Math.ceil((config.reportHalfLifeMs * Math.log(config.initialDecayWF / config.minWeightThreshold)) /
        (Math.log(2) * 60_000));
    return {
        expectedNullMinute: expectedDropMinute,
        actualFirstNullMinute: firstMinuteWithNull(series.map((entry) => ({
            minute: entry.minute,
            value: entry.locationANoise,
        }))),
        actualGroupNullMinute: firstMinuteWithNull(series.map((entry) => ({
            minute: entry.minute,
            value: entry.groupNoise,
        }))),
        assessment: assessDecayPace(series, expectedDropMinute),
        series,
    };
}
async function runGroupRecencyScenario(config) {
    const now = new Date();
    const weights = [0, 30, 60, 120, 180, 240];
    const series = [];
    for (const staleAgeSeconds of weights) {
        const harness = createHarness(config, {
            locations: [
                makeLocation("loc-fresh", "group-1", {
                    currentNoiseLevel: 42,
                    currentOccupancyLevel: 2,
                    updatedAt: now,
                }),
                makeLocation("loc-stale", "group-1", {
                    currentNoiseLevel: 72,
                    currentOccupancyLevel: 5,
                    updatedAt: secondsBefore(now, staleAgeSeconds),
                }),
            ],
        });
        await harness.service.updateGroupStatus("group-1");
        const group = harness.locationGroupRepository.snapshot()[0];
        series.push({
            staleAgeSeconds,
            aggregateNoise: group.currentNoiseLevel,
            aggregateOccupancy: group.currentOccupancyLevel,
        });
    }
    return {
        freshnessWindowSeconds: config.groupFreshnessWindowMs / 1000,
        assessment: assessGroupRecency(series),
        series,
    };
}
function createHarness(config, overrides) {
    const users = overrides?.users ??
        [makeUser("user-a"), makeUser("user-b"), makeUser("user-c"), makeUser("user-outlier")];
    const locations = overrides?.locations ??
        [
            makeLocation("loc-a", "group-1"),
            makeLocation("loc-b", "group-1"),
        ];
    const groups = overrides?.groups ?? [makeGroup("group-1")];
    const userRepository = new InMemoryUserRepository(users);
    const reportRepository = new InMemoryReportRepository(overrides?.reports ?? []);
    const studyLocationRepository = new InMemoryStudyLocationRepository(locations);
    const locationGroupRepository = new InMemoryLocationGroupRepository(groups);
    const service = new uml_service_layout_1.A1Service(reportRepository, userRepository, studyLocationRepository, locationGroupRepository, config);
    return {
        service,
        userRepository,
        reportRepository,
        studyLocationRepository,
        locationGroupRepository,
    };
}
function loadConfigOverride() {
    const overrideArg = process.argv[2];
    if (!overrideArg) {
        return { ...uml_service_layout_1.defaultA1Config };
    }
    const overridePath = node_path_1.default.resolve(process.cwd(), overrideArg);
    const parsed = JSON.parse(node_fs_1.default.readFileSync(overridePath, "utf8"));
    return {
        ...uml_service_layout_1.defaultA1Config,
        ...parsed,
        componentWeights: {
            ...uml_service_layout_1.defaultA1Config.componentWeights,
            ...(parsed.componentWeights ?? {}),
        },
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
function makeLocation(studyLocationId, locationGroupId, overrides) {
    return {
        studyLocationId,
        locationGroupId,
        name: studyLocationId,
        latitude: 28.6024,
        longitude: -81.2001,
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
        createdAt: new Date("2026-03-28T12:00:00.000Z"),
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
function minutesAfter(base, minutes) {
    return new Date(base.getTime() + minutes * 60_000);
}
function secondsBefore(base, seconds) {
    return new Date(base.getTime() - seconds * 1_000);
}
function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function firstMinuteAtOrAbove(series, threshold) {
    const match = series.find((entry) => entry.aggregateNoise !== null && entry.aggregateNoise >= threshold);
    return match ? match.minute : null;
}
function firstMinuteWithNull(series) {
    const match = series.find((entry) => entry.value === null);
    return match ? match.minute : null;
}
function maxStepDelta(values) {
    let maxDelta = 0;
    for (let index = 1; index < values.length; index += 1) {
        maxDelta = Math.max(maxDelta, Math.abs(values[index] - values[index - 1]));
    }
    return maxDelta;
}
function indexByUserId(users) {
    return new Map(users.map((user) => [user.userId, user]));
}
function classifyDampingRatio(dampingRatio) {
    if (dampingRatio <= 0.15)
        return "strong damping";
    if (dampingRatio <= 0.35)
        return "moderate damping";
    return "weak damping";
}
function assessStepResponse(series, baseline, target) {
    const finalNoise = series.at(-1)?.aggregateNoise;
    if (finalNoise === null || finalNoise === undefined) {
        return "no signal";
    }
    const finalError = Math.abs(finalNoise - target);
    if (finalError <= 3) {
        return "responsive";
    }
    if (finalNoise < baseline + (target - baseline) * 0.6) {
        return "too sluggish";
    }
    return "still converging";
}
function assessTrustDrift(final, series) {
    const occupancyShift = Math.abs(final.overReporterOccupancyWF - 1);
    const noiseShift = Math.abs(final.underReporterNoiseWF - 1);
    const perCycleSpike = Math.max(maxStepDelta(series.map((entry) => entry.overReporterOccupancyWF)), maxStepDelta(series.map((entry) => entry.underReporterNoiseWF)));
    if (perCycleSpike > 0.08 || occupancyShift > 0.25 || noiseShift > 0.25) {
        return "aggressive";
    }
    if (occupancyShift < 0.05 && noiseShift < 0.05) {
        return "too weak";
    }
    return "balanced";
}
function assessDecayPace(series, expectedDropMinute) {
    const actual = firstMinuteWithNull(series.map((entry) => ({ minute: entry.minute, value: entry.locationANoise })));
    if (actual === null) {
        return "did not decay to null in window";
    }
    if (Math.abs(actual - expectedDropMinute) <= 1) {
        return "on target";
    }
    return actual < expectedDropMinute ? "decays too quickly" : "decays too slowly";
}
function assessGroupRecency(series) {
    const atZero = series.find((entry) => entry.staleAgeSeconds === 0)?.aggregateNoise ?? null;
    const afterWindow = series.find((entry) => entry.staleAgeSeconds === 240)?.aggregateNoise ?? null;
    if (atZero === null || afterWindow === null) {
        return "insufficient data";
    }
    if (afterWindow < atZero - 10) {
        return "stale locations lose influence as expected";
    }
    return "stale locations still dominate too long";
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
