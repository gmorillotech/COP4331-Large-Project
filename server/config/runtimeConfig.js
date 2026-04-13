// Cross-platform location domain rules live in the shared JSON file so that
// the server and the Flutter client consume the same values. Update that file
// when changing any of these three values; the Flutter mirror is documented in
// flutter_application_1/lib/config/app_tuning.dart.
const sharedLocationTuning = require("../../shared/config/locationTuning.json");

const SERVER_RUNTIME_CONFIG = Object.freeze({
  display: Object.freeze({
    reportStaleMinutes: Number(process.env.REPORT_STALE_MINUTES) || 2880,
    statusFallbackFreshnessMinutes:
      Number(process.env.STATUS_FALLBACK_FRESHNESS_MINUTES) || 180,
    noiseThresholds: Object.freeze({
      quiet: Number(process.env.NOISE_THRESHOLD_QUIET) || 50,
      moderate: Number(process.env.NOISE_THRESHOLD_MODERATE) || 60,
      busy: Number(process.env.NOISE_THRESHOLD_BUSY) || 72,
      loud: Number(process.env.NOISE_THRESHOLD_LOUD) || 80,
    }),
  }),
  polling: Object.freeze({
    reportPollIntervalMs: Number(process.env.REPORT_POLL_INTERVAL_MS) || 60_000,
    minimumPollIntervalMs: 1_000,
  }),
  reports: Object.freeze({
    reportsByLocationLimit: 20,
    recentReportsLimit: 15,
    archivedSummaryDefaultLimit: 500,
    archivedSummaryMaxLimit: 1000,
    historicalBaselineFetchLimit: 1000,
  }),
  admin: Object.freeze({
    activeReportsDefaultPageSize: 50,
    activeReportsMaxPageSize: 200,
  }),
  auth: Object.freeze({
    verificationCodeTtlMs: 15 * 60 * 1000,
  }),
  location: Object.freeze({
    nearestResolutionDistanceMeters:
      sharedLocationTuning.nearestResolutionDistanceMeters,
    locationGroupPaddingMeters: sharedLocationTuning.locationGroupPaddingMeters,
    minimumLocationGroupRadiusMeters:
      sharedLocationTuning.minimumLocationGroupRadiusMeters,
    defaultUserCreatedLocationGroupRadiusMeters: 60,
    duplicateLocationRadiusMeters: 20,
    generatedGroupBoundarySides: 6,
  }),
});

module.exports = {
  SERVER_RUNTIME_CONFIG,
};
