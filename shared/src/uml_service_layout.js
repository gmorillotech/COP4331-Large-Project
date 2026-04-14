"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportController = exports.LocationController = exports.AuthController = exports.ReportService = exports.A1Service = exports.SessionService = exports.LocationService = exports.AuthService = exports.defaultA1Config = exports.defaultSessionServiceConfig = void 0;
const support_services_1 = require("./support_services");
exports.defaultSessionServiceConfig = {
    minimumSampleCount: 10,
    smoothingWindowSize: 5,
    winsorizeLowerQuantile: 0.05,
    winsorizeUpperQuantile: 0.95,
};
exports.defaultA1Config = {
    initialDecayWF: 1.0,
    // 48h half-life: at 48h the decay factor is 0.5 — well above the 0.05
    // threshold — so reports contribute to map aggregation for the full
    // retention window. Pairs with archiveThresholdMs below so reports
    // stay visible right up to the moment they're archived.
    reportHalfLifeMs: 48 * 60 * 60 * 1000,
    minWeightThreshold: 0.05,
    // 48h archive threshold: raw reports are not compressed into archive
    // summaries (and their source rows deleted) until they're older than
    // 48 hours. Below this age every report row persists in the Report
    // collection untouched.
    archiveThresholdMs: 48 * 60 * 60 * 1000,
    archiveBucketMinutes: 30,
    // Window in which a child StudyLocation's most-recent update still counts
    // toward its parent LocationGroup's aggregate noise/occupancy. Previously
    // 3 minutes, which caused group cards to blank out shortly after the last
    // submitted report even though the underlying StudyLocations were still
    // populated. Defaults to 180 minutes to align with
    // STATUS_FALLBACK_FRESHNESS_MINUTES; override via GROUP_FRESHNESS_WINDOW_MS
    // (milliseconds) when a tighter window is desired.
    groupFreshnessWindowMs:
        Number(typeof process !== "undefined" ? process.env?.GROUP_FRESHNESS_WINDOW_MS : undefined) ||
            180 * 60 * 1000,
    varianceSoftCap: 25,
    minReportsForTrustUpdate: 3,
    noiseTrustRangeDb: 12,
    minUserNoiseWF: 0.5,
    maxUserNoiseWF: 1.5,
    minUserOccupancyWF: 0.5,
    maxUserOccupancyWF: 1.5,
    occupancyOverreportRate: 0.12,
    occupancyUnderreportRate: 0.05,
    noiseOverreportRate: 0.06,
    noiseUnderreportRate: 0.12,
    trustExponent: 1.5,
    trustDeadband: 0.08,
    peerWindowMs: 10 * 60 * 1000,
    historicalLookbackDays: 28,
    historicalBucketToleranceMinutes: 45,
    minPeerCountForPeerScore: 2,
    peerToleranceDb: 10,
    historicalToleranceDb: 14,
    minSessionCorrectionWF: 0.35,
    userNoiseWFNeutral: 1.0,
    userNoiseWFSoftRange: 0.6,
    componentWeights: {
        historical: 0.4,
        user: 0.2,
        peer: 0.4,
    },
    historicalHalfLifeDays: 14,
    historicalMaxAgeDays: 30,
    minimumHistoricalWeight: 0.2,
    occupancyTrustNormalizationDivisor: 4,
    neutralUserWeight: 1.0,
    // Tune these later after calibration with real report data.
};
class AuthService {
    userRepository;
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    async registerUser(userData) {
        return this.userRepository.createUser(userData);
    }
    async authenticateUser(loginData) {
        const authenticationResult = await this.userRepository.authenticate(loginData);
        if (!authenticationResult) {
            throw new Error("Invalid login credentials");
        }
        return authenticationResult;
    }
    async verifyEmail(token) {
        const user = await this.userRepository.verifyEmail(token);
        if (!user) {
            throw new Error("Invalid verification token");
        }
        return user;
    }
    async generateResetToken(email) {
        return this.userRepository.generateResetToken(email);
    }
    async resetPassword(token, newPassword) {
        return this.userRepository.resetPassword(token, newPassword);
    }
}
exports.AuthService = AuthService;
class LocationService {
    studyLocationRepository;
    locationGroupRepository;
    maxResolutionDistanceMeters;
    constructor(studyLocationRepository, locationGroupRepository, maxResolutionDistanceMeters = 150) {
        this.studyLocationRepository = studyLocationRepository;
        this.locationGroupRepository = locationGroupRepository;
        this.maxResolutionDistanceMeters = maxResolutionDistanceMeters;
    }
    async getAllGroups() {
        return this.locationGroupRepository.getAllLocationGroups();
    }
    async listLocationsByGroup(groupId) {
        const locations = await this.studyLocationRepository.getAllStudyLocations();
        return locations.filter((location) => location.locationGroupId === groupId);
    }
    async getLocationById(locationId) {
        const location = await this.studyLocationRepository.getStudyLocationById(locationId);
        if (!location) {
            throw new Error(`StudyLocation not found for id ${locationId}`);
        }
        return location;
    }
    async getLocationGroup(locationId) {
        const location = await this.getLocationById(locationId);
        const group = await this.locationGroupRepository.getLocationGroupById(location.locationGroupId);
        if (!group) {
            throw new Error(`LocationGroup not found for id ${location.locationGroupId}`);
        }
        return group;
    }
    async getClosestLocation(coords) {
        const studyLocations = await this.studyLocationRepository.getAllStudyLocations();
        if (studyLocations.length === 0) {
            throw new Error("No study locations are configured");
        }
        let closestLocation = null;
        let closestDistanceMeters = Number.POSITIVE_INFINITY;
        for (const location of studyLocations) {
            const distanceMeters = haversineDistanceMeters(coords, {
                latitude: location.latitude,
                longitude: location.longitude,
            });
            if (distanceMeters < closestDistanceMeters) {
                closestLocation = location;
                closestDistanceMeters = distanceMeters;
            }
        }
        if (!closestLocation || closestDistanceMeters > this.maxResolutionDistanceMeters) {
            throw new Error("No study location found within the allowed resolution distance");
        }
        return closestLocation;
    }
}
exports.LocationService = LocationService;
class SessionService {
    locationService;
    userRepository;
    config;
    constructor(locationService, userRepository, config = exports.defaultSessionServiceConfig) {
        this.locationService = locationService;
        this.userRepository = userRepository;
        this.config = config;
    }
    async initializeSession(userId, coords) {
        const studyLocation = await this.fetchStudyLocation(coords);
        await this.loadUserContext(userId);
        return {
            userId,
            studyLocationId: studyLocation.studyLocationId,
            startedAt: new Date(),
            lastSampleTime: null,
            occupancyLevel: null,
            noiseWindow: [],
        };
    }
    async fetchStudyLocation(coords) {
        return this.locationService.getClosestLocation(coords);
    }
    async loadUserContext(userId) {
        const user = await this.userRepository.findUserById(userId);
        if (!user) {
            throw new Error(`User not found for id ${userId}`);
        }
        return user;
    }
    getDecibelReading(sessionState, reading) {
        if (!Number.isFinite(reading) || reading < 0) {
            throw new Error("Decibel reading must be a non-negative finite number");
        }
        sessionState.noiseWindow.push(reading);
        sessionState.lastSampleTime = new Date();
    }
    updateOccupancy(sessionState, level, _timestamp = new Date()) {
        if (!Number.isInteger(level) || level < 1 || level > 5) {
            throw new Error("Occupancy level must be an integer in the range 1..5");
        }
        sessionState.occupancyLevel = level;
    }
    buildReport(sessionState) {
        if (sessionState.occupancyLevel === null) {
            throw new Error("Cannot build report without an occupancy level");
        }
        const summary = this.summarizeNoiseWindow(sessionState.noiseWindow);
        return {
            userId: sessionState.userId,
            studyLocationId: sessionState.studyLocationId,
            avgNoise: summary.avgNoise,
            maxNoise: summary.maxNoise,
            variance: summary.variance,
            occupancy: sessionState.occupancyLevel,
            createdAt: new Date(),
        };
    }
    resetWindowVariables(sessionState) {
        sessionState.noiseWindow = [];
    }
    advanceWindow(sessionState) {
        this.resetWindowVariables(sessionState);
    }
    summarizeNoiseWindow(rawSamples) {
        const sanitizedSamples = rawSamples.filter((sample) => Number.isFinite(sample) && sample >= 0);
        if (sanitizedSamples.length < this.config.minimumSampleCount) {
            throw new Error(`At least ${this.config.minimumSampleCount} valid noise samples are required`);
        }
        const smoothedSamples = movingAverageSmooth(sanitizedSamples, this.config.smoothingWindowSize);
        const processedSamples = winsorizeSamples(smoothedSamples, this.config.winsorizeLowerQuantile, this.config.winsorizeUpperQuantile);
        return {
            sampleCount: processedSamples.length,
            avgNoise: mean(processedSamples),
            maxNoise: Math.max(...processedSamples),
            variance: computeVariance(processedSamples),
            processedSamples,
        };
    }
}
exports.SessionService = SessionService;
class A1Service {
    reportRepository;
    userRepository;
    studyLocationRepository;
    locationGroupRepository;
    config;
    constructor(reportRepository, userRepository, studyLocationRepository, locationGroupRepository, config = exports.defaultA1Config) {
        this.reportRepository = reportRepository;
        this.userRepository = userRepository;
        this.studyLocationRepository = studyLocationRepository;
        this.locationGroupRepository = locationGroupRepository;
        this.config = config;
    }
    async runPollingCycle(now = new Date()) {
        const [reportRecords, studyLocations, locationGroups] = await Promise.all([
            this.reportRepository.getAllReportsWithMetadata(),
            this.studyLocationRepository.getAllStudyLocations(),
            this.locationGroupRepository.getAllLocationGroups(),
        ]);
        // Diagnostic: detect if studyLocations array contains duplicate
        // studyLocationIds. That would explain the "two writes in the
        // same cycle for the same location" pattern we've been chasing.
        {
            const slIds = studyLocations.map((l) => l.studyLocationId);
            const uniqueSlIds = new Set(slIds);
            if (slIds.length !== uniqueSlIds.size) {
                const counts = {};
                for (const id of slIds) counts[id] = (counts[id] || 0) + 1;
                const dupes = Object.entries(counts).filter(([, c]) => c > 1);
                console.log(`[A1-dup] studyLocations dupes detected array_len=${slIds.length} unique=${uniqueSlIds.size} dupes=${JSON.stringify(dupes)}`);
            }
        }
        const userIds = unique(reportRecords.map((record) => record.report.userId));
        const fetchedUsers = await this.userRepository.findUsersByIds(userIds);
        const userMap = new Map(fetchedUsers.map((user) => [user.userId, { ...user }]));
        const metadataUpdates = [];
        const staleReportIds = [];
        const activeRecords = [];
        for (const record of reportRecords) {
            const user = getOrCreateUser(userMap, record.report.userId, this.config);
            const metadata = this.evaluateReportMetadata(record.report, reportRecords, user, now);
            if (metadata.decayFactor <= this.config.minWeightThreshold) {
                staleReportIds.push(record.report.reportId);
                continue;
            }
            metadataUpdates.push(metadata);
            activeRecords.push({ report: record.report, metadata, user });
        }
        if (metadataUpdates.length > 0) {
            await this.reportRepository.upsertReportMetadata(metadataUpdates);
        }
        if (staleReportIds.length > 0) {
            await this.reportRepository.deleteReports(staleReportIds);
        }
        const updatedStudyLocations = this.recalculateAllStudyLocations(studyLocations, activeRecords, now);
        await this.studyLocationRepository.bulkUpdateStudyLocations(updatedStudyLocations);
        const updatedLocationGroups = this.recalculateAllLocationGroups(locationGroups, updatedStudyLocations, now);
        await this.locationGroupRepository.bulkUpdateLocationGroups(updatedLocationGroups);
        const updatedUsers = this.updateUserTrustFactors(activeRecords, updatedStudyLocations);
        if (updatedUsers.length > 0) {
            await this.userRepository.updateUser(updatedUsers[0]);
            if (updatedUsers.length > 1) {
                await Promise.all(updatedUsers.slice(1).map((user) => this.userRepository.updateUser(user)));
            }
        }
        return {
            evaluatedAt: now,
            // Item 2: expose the raw count of live reports read from the
            // repository so callers can tell "decay filtered them out" (total
            // non-zero, active=0) from "reports are missing from the DB"
            // (total=0). Without this the [A1] log can't distinguish Bug A
            // (aggregate blank-out) from Bug B (persistence/kind-flip).
            totalReportCount: reportRecords.length,
            activeReportCount: activeRecords.length,
            staleReportIds,
            updatedStudyLocations,
            updatedLocationGroups,
            updatedUsers,
        };
    }
    evaluateReportMetadata(report, reportHistory, user, now) {
        const decayFactor = computeReportDecayFactor(report.createdAt, now, this.config.initialDecayWF, this.config.reportHalfLifeMs);
        const varianceCorrectionWF = computeVarianceCorrectionWF(report.variance, this.config.varianceSoftCap);
        const diagnostics = this.evaluateSessionCorrection(report, reportHistory, user);
        const noiseWeightFactor = Math.max(0, decayFactor * varianceCorrectionWF * diagnostics.sessionCorrectionNoiseWF * user.userNoiseWF);
        const occupancyWeightFactor = Math.max(0, decayFactor * user.userOccupancyWF);
        return {
            reportId: report.reportId,
            decayFactor,
            varianceCorrectionWF,
            sessionCorrectionNoiseWF: diagnostics.sessionCorrectionNoiseWF,
            noiseWeightFactor,
            occupancyWeightFactor,
            lastEvaluatedAt: now,
        };
    }
    async initializeMetadataForNewReport(report, evaluatedAt = report.createdAt) {
        const [reportsAtLocation, fetchedUsers] = await Promise.all([
            this.reportRepository.getReportsByLocation(report.studyLocationId),
            this.userRepository.findUsersByIds([report.userId]),
        ]);
        const userMap = new Map(fetchedUsers.map((user) => [user.userId, { ...user }]));
        const user = getOrCreateUser(userMap, report.userId, this.config);
        const metadata = this.evaluateReportMetadata(report, reportsAtLocation, user, evaluatedAt);
        await this.reportRepository.upsertReportMetadata([metadata]);
        return metadata;
    }
    async recalculateLocationStatus(locationId) {
        const [location, reports] = await Promise.all([
            this.studyLocationRepository.getStudyLocationById(locationId),
            this.reportRepository.getReportsByLocation(locationId),
        ]);
        if (!location) {
            throw new Error(`StudyLocation not found for id ${locationId}`);
        }
        const userIds = unique(reports.map((record) => record.report.userId));
        const users = await this.userRepository.findUsersByIds(userIds);
        const userMap = new Map(users.map((user) => [user.userId, user]));
        const activeRecords = reports
            .map((record) => {
            const user = getOrCreateUser(userMap, record.report.userId, this.config);
            const metadata = this.evaluateReportMetadata(record.report, reports, user, new Date());
            if (metadata.decayFactor <= this.config.minWeightThreshold) {
                return null;
            }
            return { report: record.report, metadata, user };
        })
            .filter(isDefined);
        const [updatedLocation] = this.recalculateAllStudyLocations([location], activeRecords, new Date());
        await this.studyLocationRepository.updateStudyLocation(updatedLocation);
    }
    async updateGroupStatus(groupId) {
        const [group, allLocations] = await Promise.all([
            this.locationGroupRepository.getLocationGroupById(groupId),
            this.studyLocationRepository.getAllStudyLocations(),
        ]);
        if (!group) {
            throw new Error(`LocationGroup not found for id ${groupId}`);
        }
        const relevantLocations = allLocations.filter((location) => location.locationGroupId === groupId);
        const [updatedGroup] = this.recalculateAllLocationGroups([group], relevantLocations, new Date());
        await this.locationGroupRepository.updateLocationGroup(updatedGroup);
    }
    async pruneExpiredReports(locationId) {
        const reportRecords = await this.reportRepository.getReportsByLocation(locationId);
        const staleReportIds = reportRecords
            .map((record) => {
            const decayFactor = computeReportDecayFactor(record.report.createdAt, new Date(), this.config.initialDecayWF, this.config.reportHalfLifeMs);
            return decayFactor <= this.config.minWeightThreshold ? record.report.reportId : null;
        })
            .filter(isDefined);
        if (staleReportIds.length > 0) {
            await this.reportRepository.deleteReports(staleReportIds);
        }
    }
    evaluateSessionCorrection(report, reportHistory, user) {
        const sessionCorrectionService = new support_services_1.SessionCorrectionService({
            peerWindowMs: this.config.peerWindowMs,
            historicalLookbackDays: this.config.historicalLookbackDays,
            historicalBucketToleranceMinutes: this.config.historicalBucketToleranceMinutes,
            minPeerCountForPeerScore: this.config.minPeerCountForPeerScore,
            peerToleranceDb: this.config.peerToleranceDb,
            historicalToleranceDb: this.config.historicalToleranceDb,
            minSessionCorrectionWF: this.config.minSessionCorrectionWF,
            userNoiseWFNeutral: this.config.userNoiseWFNeutral,
            userNoiseWFSoftRange: this.config.userNoiseWFSoftRange,
            componentWeights: this.config.componentWeights,
        });
        return sessionCorrectionService.evaluate({
            report,
            reportHistory: reportHistory.map((record) => record.report),
            user,
            now: report.createdAt,
        });
    }
    recalculateAllStudyLocations(studyLocations, activeRecords, now) {
        const reportsByLocationId = groupBy(activeRecords, (record) => record.report.studyLocationId);
        return studyLocations.map((location) => {
            const locationRecords = reportsByLocationId.get(location.studyLocationId) ?? [];
            if (locationRecords.length === 0) {
                // Bug A fix: do NOT unconditionally null the aggregates when
                // a cycle sees no active records for this location. The last
                // known reading is still the best estimate we have. Mirror
                // the LocationGroup freshness behaviour: preserve the prior
                // currentNoiseLevel / currentOccupancyLevel while the prior
                // updatedAt is within groupFreshnessWindowMs; only blank
                // once the location is genuinely stale past that window.
                const priorUpdatedAt = location.updatedAt;
                const withinFreshnessWindow =
                    priorUpdatedAt instanceof Date &&
                    now.getTime() - priorUpdatedAt.getTime() <= this.config.groupFreshnessWindowMs;
                if (withinFreshnessWindow) {
                    return { ...location, updatedAt: location.updatedAt };
                }
                return {
                    ...location,
                    currentNoiseLevel: null,
                    currentOccupancyLevel: null,
                    updatedAt: location.updatedAt,
                };
            }
            const noiseNumerator = locationRecords.reduce((sum, record) => sum + record.report.avgNoise * record.metadata.noiseWeightFactor, 0);
            const noiseDenominator = locationRecords.reduce((sum, record) => sum + record.metadata.noiseWeightFactor, 0);
            const occupancyNumerator = locationRecords.reduce((sum, record) => sum + record.report.occupancy * record.metadata.occupancyWeightFactor, 0);
            const occupancyDenominator = locationRecords.reduce((sum, record) => sum + record.metadata.occupancyWeightFactor, 0);
            return {
                ...location,
                currentNoiseLevel: noiseDenominator > 0 ? noiseNumerator / noiseDenominator : null,
                currentOccupancyLevel: occupancyDenominator > 0 ? occupancyNumerator / occupancyDenominator : null,
                updatedAt: now,
            };
        });
    }
    recalculateAllLocationGroups(groups, locations, now) {
        const locationsByGroupId = groupBy(locations, (location) => location.locationGroupId);
        return groups.map((group) => {
            const childLocations = (locationsByGroupId.get(group.locationGroupId) ?? []).filter((location) => location.updatedAt !== null &&
                location.currentNoiseLevel !== null &&
                location.currentOccupancyLevel !== null);
            // Bug A fix: do NOT null the group's aggregate when every child
            // happens to have null values in this cycle. Fall through to the
            // freshness-preservation branch below (activeWeightedChildren
            // will be empty, which preserves the previously-published group
            // aggregates instead of blanking the card).
            const weightedChildren = childLocations.map((location) => ({
                location,
                recencyWeight: computeLocationRecencyWeight(location.updatedAt, now, this.config.groupFreshnessWindowMs),
            }));
            const activeWeightedChildren = weightedChildren.filter((entry) => entry.recencyWeight > 0);
            if (activeWeightedChildren.length === 0) {
                // Preserve the previously-published group aggregates instead of
                // nulling them when no child is fresh enough; the underlying
                // StudyLocations still hold their last-known values, so blanking
                // the parent card flashes empty between report submissions.
                return {
                    ...group,
                    updatedAt: group.updatedAt,
                };
            }
            const noiseNumerator = activeWeightedChildren.reduce((sum, entry) => sum + entry.location.currentNoiseLevel * entry.recencyWeight, 0);
            const occupancyNumerator = activeWeightedChildren.reduce((sum, entry) => sum + entry.location.currentOccupancyLevel * entry.recencyWeight, 0);
            const denominator = activeWeightedChildren.reduce((sum, entry) => sum + entry.recencyWeight, 0);
            const newestUpdatedAt = activeWeightedChildren.reduce((latest, entry) => {
                const updatedAt = entry.location.updatedAt;
                return updatedAt.getTime() > latest.getTime() ? updatedAt : latest;
            }, activeWeightedChildren[0].location.updatedAt);
            return {
                ...group,
                currentNoiseLevel: denominator > 0 ? noiseNumerator / denominator : null,
                currentOccupancyLevel: denominator > 0 ? occupancyNumerator / denominator : null,
                updatedAt: newestUpdatedAt,
            };
        });
    }
    updateUserTrustFactors(activeRecords, studyLocations) {
        const locationMap = new Map(studyLocations.map((location) => [location.studyLocationId, location]));
        const userBuckets = new Map();
        for (const activeRecord of activeRecords) {
            const location = locationMap.get(activeRecord.report.studyLocationId);
            if (!location)
                continue;
            if (location.currentNoiseLevel === null || location.currentOccupancyLevel === null)
                continue;
            const occupancySignedError = clamp((activeRecord.report.occupancy - location.currentOccupancyLevel) / this.config.occupancyTrustNormalizationDivisor, -1, 1);
            const noiseSignedError = clamp((activeRecord.report.avgNoise - location.currentNoiseLevel) / this.config.noiseTrustRangeDb, -1, 1);
            const bucket = userBuckets.get(activeRecord.user.userId) ?? {
                user: { ...activeRecord.user },
                occupancySignedErrorTotal: 0,
                noiseSignedErrorTotal: 0,
                sampleCount: 0,
            };
            bucket.occupancySignedErrorTotal += occupancySignedError;
            bucket.noiseSignedErrorTotal += noiseSignedError;
            bucket.sampleCount += 1;
            userBuckets.set(activeRecord.user.userId, bucket);
        }
        const updatedUsers = [];
        for (const bucket of userBuckets.values()) {
            if (bucket.sampleCount < this.config.minReportsForTrustUpdate) {
                continue;
            }
            const avgOccupancySignedError = bucket.occupancySignedErrorTotal / bucket.sampleCount;
            const avgNoiseSignedError = bucket.noiseSignedErrorTotal / bucket.sampleCount;
            bucket.user.userOccupancyWF = applyAsymmetricTrustUpdate(bucket.user.userOccupancyWF, avgOccupancySignedError, this.config.occupancyOverreportRate, this.config.occupancyUnderreportRate, this.config.minUserOccupancyWF, this.config.maxUserOccupancyWF, this.config.trustExponent, this.config.trustDeadband);
            bucket.user.userNoiseWF = applyAsymmetricTrustUpdate(bucket.user.userNoiseWF, avgNoiseSignedError, this.config.noiseOverreportRate, this.config.noiseUnderreportRate, this.config.minUserNoiseWF, this.config.maxUserNoiseWF, this.config.trustExponent, this.config.trustDeadband);
            updatedUsers.push(bucket.user);
        }
        return updatedUsers;
    }
}
exports.A1Service = A1Service;
class ReportService {
    reportRepository;
    a1Service;
    constructor(reportRepository, a1Service) {
        this.reportRepository = reportRepository;
        this.a1Service = a1Service;
    }
    // Accepts the exact ReportSubmission object produced by SessionService.buildReport().
    // The client submits only report fields; the server initializes A1 metadata immediately.
    async submitNewReport(reportData) {
        const report = await this.reportRepository.createReport(reportData);
        await this.a1Service.initializeMetadataForNewReport(report, report.createdAt);
        return report;
    }
    async recalculateLocationStatus(locationId) {
        await this.a1Service.recalculateLocationStatus(locationId);
    }
    async updateGroupStatus(groupId) {
        await this.a1Service.updateGroupStatus(groupId);
    }
    async pruneExpiredReports(locationId) {
        await this.a1Service.pruneExpiredReports(locationId);
    }
}
exports.ReportService = ReportService;
class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async register(req, res) {
        const user = await this.authService.registerUser(req.body);
        res.status(201).json(user);
    }
    async login(req, res) {
        const result = await this.authService.authenticateUser(req.body);
        res.status(200).json(result);
    }
    async verifyEmail(req, res) {
        const user = await this.authService.verifyEmail(req.params.token);
        res.status(200).json(user);
    }
    async forgotPassword(req, res) {
        const ok = await this.authService.generateResetToken(req.body.email);
        res.status(200).json({ ok });
    }
    async resetPassword(req, res) {
        const ok = await this.authService.resetPassword(req.body.token, req.body.newPassword);
        res.status(200).json({ ok });
    }
    async getProfile(req, res) {
        res.status(501).json({ message: "Not yet implemented" });
    }
    async updateProfile(req, res) {
        res.status(501).json({ message: "Not yet implemented" });
    }
}
exports.AuthController = AuthController;
class LocationController {
    locationService;
    constructor(locationService) {
        this.locationService = locationService;
    }
    async getAllGroups(_req, res) {
        const groups = await this.locationService.getAllGroups();
        res.status(200).json(groups);
    }
    async getLocationByGroup(req, res) {
        const locations = await this.locationService.listLocationsByGroup(req.params.groupId);
        res.status(200).json(locations);
    }
    async getLocationById(req, res) {
        const location = await this.locationService.getLocationById(req.params.locationId);
        res.status(200).json(location);
    }
    async getClosestLocation(req, res) {
        const location = await this.locationService.getClosestLocation({
            latitude: Number(req.query.latitude),
            longitude: Number(req.query.longitude),
        });
        res.status(200).json(location);
    }
}
exports.LocationController = LocationController;
class ReportController {
    sessionService;
    reportService;
    reportRepository;
    constructor(sessionService, reportService, reportRepository) {
        this.sessionService = sessionService;
        this.reportService = reportService;
        this.reportRepository = reportRepository;
    }
    async createReport(req, res) {
        const reportData = this.sessionService.buildReport(req.body.sessionState);
        const report = await this.reportService.submitNewReport(reportData);
        res.status(201).json(report);
    }
    async getReportsByLocation(req, res) {
        const reports = await this.reportRepository.getReportsByLocation(req.params.locationId);
        res.status(200).json(reports);
    }
    async getRecentReports(_req, res) {
        const reports = await this.reportRepository.getRecentReports();
        res.status(200).json(reports);
    }
}
exports.ReportController = ReportController;
function haversineDistanceMeters(a, b) {
    const earthRadiusMeters = 6_371_000;
    const latitudeDeltaRadians = toRadians(b.latitude - a.latitude);
    const longitudeDeltaRadians = toRadians(b.longitude - a.longitude);
    const aLatitudeRadians = toRadians(a.latitude);
    const bLatitudeRadians = toRadians(b.latitude);
    const haversineComponent = Math.sin(latitudeDeltaRadians / 2) ** 2 +
        Math.cos(aLatitudeRadians) *
            Math.cos(bLatitudeRadians) *
            Math.sin(longitudeDeltaRadians / 2) ** 2;
    const angularDistance = 2 * Math.atan2(Math.sqrt(haversineComponent), Math.sqrt(1 - haversineComponent));
    return earthRadiusMeters * angularDistance;
}
function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}
function movingAverageSmooth(samples, windowSize) {
    if (windowSize <= 1) {
        return [...samples];
    }
    const smoothed = [];
    for (let index = 0; index < samples.length; index += 1) {
        const startIndex = Math.max(0, index - windowSize + 1);
        const window = samples.slice(startIndex, index + 1);
        smoothed.push(mean(window));
    }
    return smoothed;
}
function winsorizeSamples(samples, lowerQuantile, upperQuantile) {
    if (samples.length === 0) {
        return [];
    }
    if (lowerQuantile < 0 || upperQuantile > 1 || lowerQuantile >= upperQuantile) {
        throw new Error("Winsorize quantiles must satisfy 0 <= lower < upper <= 1");
    }
    const sortedSamples = [...samples].sort((left, right) => left - right);
    const lowerBound = quantile(sortedSamples, lowerQuantile);
    const upperBound = quantile(sortedSamples, upperQuantile);
    return samples.map((sample) => clamp(sample, lowerBound, upperBound));
}
function quantile(sortedSamples, q) {
    if (sortedSamples.length === 1) {
        return sortedSamples[0];
    }
    const position = (sortedSamples.length - 1) * q;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const interpolationWeight = position - lowerIndex;
    if (lowerIndex === upperIndex) {
        return sortedSamples[lowerIndex];
    }
    return (sortedSamples[lowerIndex] * (1 - interpolationWeight) +
        sortedSamples[upperIndex] * interpolationWeight);
}
function computeVariance(values) {
    if (values.length === 0) {
        throw new Error("Cannot compute variance of an empty array");
    }
    const average = mean(values);
    const squaredDeviationSum = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
    return squaredDeviationSum / values.length;
}
function computeReportDecayFactor(createdAt, now, initialDecayWF, reportHalfLifeMs) {
    if (reportHalfLifeMs <= 0) {
        throw new Error("reportHalfLifeMs must be > 0");
    }
    const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
    const lambda = Math.log(2) / reportHalfLifeMs;
    return initialDecayWF * Math.exp(-lambda * ageMs);
}
function computeVarianceCorrectionWF(variance, varianceSoftCap) {
    if (varianceSoftCap <= 0) {
        throw new Error("varianceSoftCap must be > 0");
    }
    const safeVariance = Math.max(0, variance);
    const normalizedVariance = safeVariance / varianceSoftCap;
    return 1 / (1 + normalizedVariance);
}
function computeLocationRecencyWeight(updatedAt, now, groupFreshnessWindowMs) {
    if (groupFreshnessWindowMs <= 0) {
        throw new Error("groupFreshnessWindowMs must be > 0");
    }
    const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());
    return clamp(1 - ageMs / groupFreshnessWindowMs, 0, 1);
}
function applyAsymmetricTrustUpdate(currentWF, signedError, overreportRate, underreportRate, minWF, maxWF, exponent, deadband) {
    if (exponent <= 0) {
        throw new Error("trustExponent must be > 0");
    }
    if (Math.abs(signedError) <= deadband) {
        return currentWF;
    }
    const magnitude = Math.pow(Math.abs(signedError), exponent);
    if (signedError > 0) {
        return clamp(currentWF * (1 - overreportRate * magnitude), minWF, maxWF);
    }
    return clamp(currentWF * (1 + underreportRate * magnitude), minWF, maxWF);
}
function scoreDeviation(deviationDb, toleranceDb) {
    if (toleranceDb <= 0) {
        throw new Error("Tolerance dB values must be > 0");
    }
    return clamp(1 - deviationDb / toleranceDb, 0, 1);
}
function computeUserNoiseScore(user, userNoiseWFNeutral, userNoiseWFSoftRange) {
    if (userNoiseWFSoftRange <= 0) {
        throw new Error("userNoiseWFSoftRange must be > 0");
    }
    const deviationFromNeutral = Math.abs(user.userNoiseWF - userNoiseWFNeutral);
    return clamp(1 - deviationFromNeutral / userNoiseWFSoftRange, 0, 1);
}
function minuteOfWeek(date) {
    const dayOfWeek = date.getDay();
    const minutesOfDay = date.getHours() * 60 + date.getMinutes();
    return dayOfWeek * 24 * 60 + minutesOfDay;
}
function circularMinuteDistance(left, right, cycleLength) {
    const directDistance = Math.abs(left - right);
    return Math.min(directDistance, cycleLength - directDistance);
}
function mean(values) {
    if (values.length === 0) {
        throw new Error("Cannot compute mean of an empty array");
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function weightedAverage(values, weights) {
    if (values.length !== weights.length || values.length === 0) {
        throw new Error("Weighted average requires equally sized non-empty arrays");
    }
    const denominator = weights.reduce((sum, weight) => sum + weight, 0);
    if (denominator <= 0) {
        throw new Error("Weighted average requires total weight > 0");
    }
    const numerator = values.reduce((sum, value, index) => sum + value * weights[index], 0);
    return numerator / denominator;
}
function groupBy(items, getKey) {
    const map = new Map();
    for (const item of items) {
        const key = getKey(item);
        const bucket = map.get(key);
        if (bucket) {
            bucket.push(item);
        }
        else {
            map.set(key, [item]);
        }
    }
    return map;
}
function unique(items) {
    return [...new Set(items)];
}
function getOrCreateUser(userMap, userId, config) {
    const existingUser = userMap.get(userId);
    if (existingUser) {
        return existingUser;
    }
    const createdUser = {
        userId,
        userNoiseWF: clamp(config.neutralUserWeight, config.minUserNoiseWF, config.maxUserNoiseWF),
        userOccupancyWF: clamp(config.neutralUserWeight, config.minUserOccupancyWF, config.maxUserOccupancyWF),
    };
    userMap.set(userId, createdUser);
    return createdUser;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function isDefined(value) {
    return value !== null && value !== undefined;
}
/*
Layout notes:
1. This file follows the UML service structure: AuthService, SessionService, ReportService, and LocationService.
2. A1Service is kept separate because it owns the timed aggregation / decay / trust-adjustment algorithm.
3. Location resolution logic now lives inside LocationService.
4. Noise summarization logic now lives inside SessionService.
5. This UML-aligned file is the source of truth for A1Service and its asymmetric trust update flow.
6. Session-correction logic here should stay behaviorally aligned with support_services.ts.
7. Repositories remain abstract on purpose; database implementations are still pending.
*/
