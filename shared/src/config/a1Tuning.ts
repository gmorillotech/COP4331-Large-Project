// Inventory/staging file for extracting A1 tuning values out of
// shared/src/uml_service_layout.ts. These values are not all wired into
// runtime yet; the canonical live implementation still lives in that file.

export const SESSION_SUMMARIZATION_DEFAULTS = {
  minimumSampleCount: 10,
  smoothingWindowSize: 5,
  winsorizeLowerQuantile: 0.05,
  winsorizeUpperQuantile: 0.95,
} as const;

export const A1_ACTIVE_DEFAULTS = {
  initialDecayWF: 1.0,
  reportHalfLifeMs: 5 * 60 * 1000,
  minWeightThreshold: 0.05,
  archiveThresholdMs: 3 * 60 * 60 * 1000,
  archiveBucketMinutes: 30,
  groupFreshnessWindowMs: 3 * 60 * 1000,
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
  historicalHalfLifeDays: 14,
  historicalMaxAgeDays: 30,
  minimumHistoricalWeight: 0.2,
} as const;

export const A1_PENDING_EXTRACTION_DEFAULTS = {
  occupancyTrustNormalizationDivisor: 4,
  neutralUserWeight: 1.0,
} as const;

export const A1_DORMANT_SESSION_CORRECTION_DEFAULTS = {
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
} as const;

export const LOCATION_RESOLUTION_DEFAULTS = {
  sharedCanonicalMaxResolutionDistanceMeters: 100,
  knownRuntimeMaxResolutionDistanceMeters: 150,
} as const;
