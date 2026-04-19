// Cross-platform location domain rules live in the shared JSON file so that
// the server and the Flutter client consume the same values. Update that file
// when changing any of these three values; the Flutter mirror is documented in
// flutter_application_1/lib/config/app_tuning.dart.
const sharedLocationTuning = require("../../shared/config/locationTuning.json");

// Single source of truth for "how recent must live data be to still be trusted
// as the current status." Historically this was spread across two independent
// env vars (STATUS_FALLBACK_FRESHNESS_MINUTES in the server, and
// GROUP_FRESHNESS_WINDOW_MS in shared/A1), which could drift out of sync and
// cause the UI card to blank while A1 still believed the group was fresh (or
// vice versa). LOCATION_FRESHNESS_MINUTES is the preferred override; the two
// legacy env vars are still honored for backwards compatibility but resolve
// to the same value everywhere downstream.
const FRESHNESS_MINUTES = (() => {
  const explicit = Number(process.env.LOCATION_FRESHNESS_MINUTES);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const legacyStatus = Number(process.env.STATUS_FALLBACK_FRESHNESS_MINUTES);
  if (Number.isFinite(legacyStatus) && legacyStatus > 0) return legacyStatus;

  const legacyGroupMs = Number(process.env.GROUP_FRESHNESS_WINDOW_MS);
  if (Number.isFinite(legacyGroupMs) && legacyGroupMs > 0) return legacyGroupMs / 60_000;

  return 720;
})();

const SERVER_RUNTIME_CONFIG = Object.freeze({
  freshness: Object.freeze({
    freshnessMinutes: FRESHNESS_MINUTES,
    freshnessMs: FRESHNESS_MINUTES * 60 * 1000,
  }),
  display: Object.freeze({
    reportStaleMinutes: Number(process.env.REPORT_STALE_MINUTES) || 2880,
    // Retained for backwards compatibility — mirrors the unified value above.
    statusFallbackFreshnessMinutes: FRESHNESS_MINUTES,
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
    groupMergeAdjacencyMaxGapMeters:
      Number(process.env.GROUP_MERGE_ADJACENCY_MAX_GAP_METERS) || 10,
    // Narrow tolerance used to snap submitted polygon vertices onto existing
    // neighbor group edges at save/merge time. Removes float-precision drift
    // from admin-side boundary snapping so unionPolygons sees exact
    // collinearity.
    groupBoundaryNormalizeToleranceMeters:
      Number(process.env.GROUP_BOUNDARY_NORMALIZE_TOLERANCE_METERS) || 0.3,
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
