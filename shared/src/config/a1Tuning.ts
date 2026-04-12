// Canonical slice-views of A1 tuning values. The live source-of-truth
// definitions are `defaultA1Config` and `defaultSessionServiceConfig` in
// `shared/src/uml_service_layout.ts`. This file re-exports those and
// provides named subsets (active vs dormant session-correction) so
// callers can reason about which fields the runtime actually consumes.
//
// Keep this file a pure re-export. Do not duplicate literal values here.

import {
  defaultA1Config,
  defaultSessionServiceConfig,
  type A1Config,
  type SessionServiceConfig,
} from "../uml_service_layout";

export { defaultA1Config, defaultSessionServiceConfig };
export type { A1Config, SessionServiceConfig };

// Fields on A1Config that are actively consumed by the canonical A1 path.
// Session-correction diagnostics currently return constant 1.0 (see
// A1Service.evaluateSessionCorrection), so the session-correction fields
// below are dormant — present but not load-bearing at runtime.
export const A1_ACTIVE_FIELDS = [
  "initialDecayWF",
  "reportHalfLifeMs",
  "minWeightThreshold",
  "archiveThresholdMs",
  "archiveBucketMinutes",
  "groupFreshnessWindowMs",
  "varianceSoftCap",
  "minReportsForTrustUpdate",
  "noiseTrustRangeDb",
  "minUserNoiseWF",
  "maxUserNoiseWF",
  "minUserOccupancyWF",
  "maxUserOccupancyWF",
  "occupancyOverreportRate",
  "occupancyUnderreportRate",
  "noiseOverreportRate",
  "noiseUnderreportRate",
  "trustExponent",
  "trustDeadband",
  "historicalHalfLifeDays",
  "historicalMaxAgeDays",
  "minimumHistoricalWeight",
  "occupancyTrustNormalizationDivisor",
  "neutralUserWeight",
] as const satisfies ReadonlyArray<keyof A1Config>;

export const A1_DORMANT_SESSION_CORRECTION_FIELDS = [
  "peerWindowMs",
  "historicalLookbackDays",
  "historicalBucketToleranceMinutes",
  "minPeerCountForPeerScore",
  "peerToleranceDb",
  "historicalToleranceDb",
  "minSessionCorrectionWF",
  "userNoiseWFNeutral",
  "userNoiseWFSoftRange",
  "componentWeights",
] as const satisfies ReadonlyArray<keyof A1Config>;

// Canonical max nearest-resolution distance is 150 meters. Source of truth
// is `shared/config/locationTuning.json` (`nearestResolutionDistanceMeters`),
// consumed by the server via `server/config/runtimeConfig.js` and mirrored
// by Flutter in `MobileCaptureTuning.locationResolutionDistanceMeters`.
