"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSessionCorrectionServiceConfig = exports.defaultNoiseSummaryConfig = exports.defaultLocationResolutionConfig = exports.SessionCorrectionService = exports.NoiseSummaryService = exports.LocationResolutionService = void 0;
class LocationResolutionService {
    config;
    constructor(config) {
        this.config = config;
    }
    resolveNearestStudyLocation(userCoordinates, studyLocations) {
        if (studyLocations.length === 0) {
            return {
                resolvedStudyLocation: null,
                distanceMeters: null,
            };
        }
        let nearestLocation = null;
        let nearestDistanceMeters = Number.POSITIVE_INFINITY;
        for (const location of studyLocations) {
            const distanceMeters = haversineDistanceMeters(userCoordinates, {
                latitude: location.latitude,
                longitude: location.longitude,
            });
            if (distanceMeters < nearestDistanceMeters) {
                nearestLocation = location;
                nearestDistanceMeters = distanceMeters;
            }
        }
        if (nearestLocation === null ||
            nearestDistanceMeters > this.config.maxResolutionDistanceMeters) {
            return {
                resolvedStudyLocation: null,
                distanceMeters: null,
            };
        }
        return {
            resolvedStudyLocation: nearestLocation,
            distanceMeters: nearestDistanceMeters,
        };
    }
    resolveNearestStudyLocationWithinGroup(userCoordinates, studyLocations, locationGroupId) {
        const groupLocations = studyLocations.filter((location) => location.locationGroupId === locationGroupId);
        return this.resolveNearestStudyLocation(userCoordinates, groupLocations);
    }
}
exports.LocationResolutionService = LocationResolutionService;
class NoiseSummaryService {
    config;
    constructor(config) {
        this.config = config;
    }
    summarize(rawSamples) {
        const sanitizedSamples = sanitizeNoiseSamples(rawSamples);
        if (sanitizedSamples.length < this.config.minimumSampleCount) {
            throw new Error(`At least ${this.config.minimumSampleCount} valid noise samples are required`);
        }
        const smoothedSamples = movingAverageSmooth(sanitizedSamples, this.config.smoothingWindowSize);
        const processedSamples = winsorizeSamples(smoothedSamples, this.config.winsorizeLowerQuantile, this.config.winsorizeUpperQuantile);
        return {
            sampleCount: processedSamples.length,
            avgNoise: mean(processedSamples),
            maxNoise: Math.max(...processedSamples),
            variance: variance(processedSamples),
            processedSamples,
        };
    }
}
exports.NoiseSummaryService = NoiseSummaryService;
class SessionCorrectionService {
    config;
    constructor(config) {
        this.config = config;
    }
    computeSessionCorrectionNoiseWF(context) {
        return this.evaluate(context).sessionCorrectionNoiseWF;
    }
    evaluate(context) {
        const historicalPeers = this.selectHistoricalPeers(context.report, context.reportHistory);
        const currentPeers = this.selectCurrentPeers(context.report, context.reportHistory);
        const historicalBaselineNoise = historicalPeers.length > 0 ? mean(historicalPeers.map((peer) => peer.avgNoise)) : null;
        const peerBaselineNoise = currentPeers.length > 0 ? mean(currentPeers.map((peer) => peer.avgNoise)) : null;
        const historicalScore = historicalBaselineNoise === null
            ? 1.0
            : this.scoreDeviation(Math.abs(context.report.avgNoise - historicalBaselineNoise), this.config.historicalToleranceDb);
        const peerScore = currentPeers.length < this.config.minPeerCountForPeerScore || peerBaselineNoise === null
            ? 1.0
            : this.scoreDeviation(Math.abs(context.report.avgNoise - peerBaselineNoise), this.config.peerToleranceDb);
        const userScore = this.computeUserScore(context.user);
        const weightedScore = weightedAverage([historicalScore, userScore, peerScore], [
            this.config.componentWeights.historical,
            this.config.componentWeights.user,
            this.config.componentWeights.peer,
        ]);
        return {
            sessionCorrectionNoiseWF: clamp(weightedScore, this.config.minSessionCorrectionWF, 1.0),
            historicalScore,
            userScore,
            peerScore,
            historicalBaselineNoise,
            peerBaselineNoise,
            historicalPeerCount: historicalPeers.length,
            currentPeerCount: currentPeers.length,
        };
    }
    selectCurrentPeers(report, reportHistory) {
        return reportHistory.filter((candidate) => {
            if (candidate.reportId === report.reportId)
                return false;
            if (candidate.studyLocationId !== report.studyLocationId)
                return false;
            const ageDifferenceMs = Math.abs(candidate.createdAt.getTime() - report.createdAt.getTime());
            return ageDifferenceMs <= this.config.peerWindowMs;
        });
    }
    selectHistoricalPeers(report, reportHistory) {
        const reportMinuteOfWeek = minuteOfWeek(report.createdAt);
        const historicalLookbackMs = this.config.historicalLookbackDays * 24 * 60 * 60 * 1000;
        return reportHistory.filter((candidate) => {
            if (candidate.reportId === report.reportId)
                return false;
            if (candidate.studyLocationId !== report.studyLocationId)
                return false;
            const candidateAgeMs = report.createdAt.getTime() - candidate.createdAt.getTime();
            if (candidateAgeMs <= this.config.peerWindowMs)
                return false;
            if (candidateAgeMs > historicalLookbackMs)
                return false;
            const candidateMinuteOfWeek = minuteOfWeek(candidate.createdAt);
            const minuteDifference = circularMinuteDistance(reportMinuteOfWeek, candidateMinuteOfWeek, 7 * 24 * 60);
            return minuteDifference <= this.config.historicalBucketToleranceMinutes;
        });
    }
    scoreDeviation(deviationDb, toleranceDb) {
        if (toleranceDb <= 0) {
            throw new Error("Tolerance dB values must be > 0");
        }
        return clamp(1 - deviationDb / toleranceDb, 0, 1);
    }
    computeUserScore(user) {
        const deviationFromNeutral = Math.abs(user.userNoiseWF - this.config.userNoiseWFNeutral);
        if (this.config.userNoiseWFSoftRange <= 0) {
            throw new Error("userNoiseWFSoftRange must be > 0");
        }
        return clamp(1 - deviationFromNeutral / this.config.userNoiseWFSoftRange, 0, 1);
    }
}
exports.SessionCorrectionService = SessionCorrectionService;
exports.defaultLocationResolutionConfig = {
    maxResolutionDistanceMeters: 150,
};
exports.defaultNoiseSummaryConfig = {
    minimumSampleCount: 10,
    smoothingWindowSize: 5,
    winsorizeLowerQuantile: 0.05,
    winsorizeUpperQuantile: 0.95,
};
exports.defaultSessionCorrectionServiceConfig = {
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
    // Tune these later after calibration with real report data.
};
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
function sanitizeNoiseSamples(rawSamples) {
    return rawSamples.filter((sample) => Number.isFinite(sample) && sample >= 0);
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
function mean(values) {
    if (values.length === 0) {
        throw new Error("Cannot compute mean of an empty array");
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function variance(values) {
    if (values.length === 0) {
        throw new Error("Cannot compute variance of an empty array");
    }
    const average = mean(values);
    const squaredDeviationSum = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
    return squaredDeviationSum / values.length;
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
function minuteOfWeek(date) {
    const dayOfWeek = date.getDay();
    const minutesOfDay = date.getHours() * 60 + date.getMinutes();
    return dayOfWeek * 24 * 60 + minutesOfDay;
}
function circularMinuteDistance(left, right, cycleLength) {
    const directDistance = Math.abs(left - right);
    return Math.min(directDistance, cycleLength - directDistance);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/*
Usage notes:
1. A1 already handles gradual change over time with report decay. This service only reduces
   confidence for noise reports that look unusually far from historical norms or current peers.
2. Current peers are restricted to the exact same studyLocationId, not just the same group.
3. Historical peers are restricted to the exact same studyLocationId and a similar minute-of-week.
4. User noise weighting is treated here as a proxy for device confidence, not as a hard dB offset.
5. Keep this extracted session-correction logic behaviorally aligned with uml_service_layout.ts, which is the canonical A1Service implementation.
*/
