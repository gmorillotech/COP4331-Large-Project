# Config Inventory

This document inventories the numeric defaults and operational thresholds that
currently act as configuration across the project.

Important: several of the files listed below are inventory/staging files added
to support extraction work. They are not all wired into runtime yet. The current
live sources of truth are called out explicitly.

## Live Sources of Truth Today

- Shared A1 defaults and session summarization:
  `shared/src/uml_service_layout.ts`
- Server runtime/display defaults:
  `server/config/appConfig.js`
- Server location-service defaults:
  `server/services/locationService.js`
- Mobile data-collection defaults:
  `flutter_application_1/lib/data_collection/data_collection_workflow.dart`
  and `flutter_application_1/lib/data_collection/data_collection_model.dart`
- Web UI/admin defaults:
  `Web_Frontend/src/components/...` and `Web_Frontend/src/lib/...`

## Inventory Files Added For Extraction

- Shared A1/math inventory:
  `shared/src/config/a1Tuning.ts`
- Server runtime/config inventory:
  `server/config/runtimeConfig.js`
- Flutter/mobile inventory:
  `flutter_application_1/lib/config/app_tuning.dart`
- Web/admin/map UI inventory:
  `Web_Frontend/src/config/uiTuning.ts`

## A1 / Shared Algorithm

Current live source: `shared/src/uml_service_layout.ts`

### Session summarization

- `minimumSampleCount = 10`
- `smoothingWindowSize = 5`
- `winsorizeLowerQuantile = 0.05`
- `winsorizeUpperQuantile = 0.95`

### Active A1 math

- `initialDecayWF = 1.0`
- `reportHalfLifeMs = 5 * 60 * 1000`
- `minWeightThreshold = 0.05`
- `archiveThresholdMs = 3 * 60 * 60 * 1000`
- `archiveBucketMinutes = 30`
- `groupFreshnessWindowMs = 3 * 60 * 1000`
- `varianceSoftCap = 25`
- `minReportsForTrustUpdate = 3`
- `noiseTrustRangeDb = 12`
- `minUserNoiseWF = 0.5`
- `maxUserNoiseWF = 1.5`
- `minUserOccupancyWF = 0.5`
- `maxUserOccupancyWF = 1.5`
- `occupancyOverreportRate = 0.12`
- `occupancyUnderreportRate = 0.05`
- `noiseOverreportRate = 0.06`
- `noiseUnderreportRate = 0.12`
- `trustExponent = 1.5`
- `trustDeadband = 0.08`
- `historicalHalfLifeDays = 14`
- `historicalMaxAgeDays = 30`
- `minimumHistoricalWeight = 0.2`

### Known extraction candidates still hardcoded in logic

- `occupancyTrustNormalizationDivisor = 4`
- `neutralUserWeight = 1.0`

### Legacy / dormant session-correction settings

These still exist in config but are not active in the canonical A1 path while
session correction is stubbed:

- `peerWindowMs = 10 * 60 * 1000`
- `historicalLookbackDays = 28`
- `historicalBucketToleranceMinutes = 45`
- `minPeerCountForPeerScore = 2`
- `peerToleranceDb = 10`
- `historicalToleranceDb = 14`
- `minSessionCorrectionWF = 0.35`
- `userNoiseWFNeutral = 1.0`
- `userNoiseWFSoftRange = 0.6`
- `componentWeights = { historical: 0.4, user: 0.2, peer: 0.4 }`

## Server Runtime / Operational Defaults

Current live sources:

- `server/config/appConfig.js`
- `server/services/reportProcessingService.js`
- `server/services/locationService.js`
- `server/services/adminSearchService.js`
- `server/controllers/reportController.js`
- `server/controllers/authController.js`
- `server/services/adminUserService.js`

### Display / recency

- `reportStaleMinutes = 2880`
- noise thresholds:
  - `quiet = 50`
  - `moderate = 60`
  - `busy = 72`
  - `loud = 80`

### Polling / archival fetch

- `reportPollIntervalMs = 60_000`
- `minimumPollIntervalMs = 1_000`
- `historicalBaselineFetchLimit = 1000`
- `archivedSummaryDefaultLimit = 500`
- `archivedSummaryMaxLimit = 1000`

### Report/admin route limits

- `reportsByLocationLimit = 20`
- `recentReportsLimit = 15`
- `adminActiveReportsDefaultPageSize = 50`
- `adminActiveReportsMaxPageSize = 200`

### Auth / account recovery

- `verificationCodeTtlMs = 15 * 60 * 1000`
- `verificationCodeDigits = 6`

### Location/group operational defaults

- `nearestResolutionDistanceMeters = 150`
- `locationGroupPaddingMeters = 45`
- `minimumLocationGroupRadiusMeters = 40`
- `defaultUserCreatedLocationGroupRadiusMeters = 60`
- `duplicateLocationRadiusMeters = 20`
- `generatedGroupBoundarySides = 6`

## Mobile / Flutter

Current live sources:

- `flutter_application_1/lib/data_collection/data_collection_workflow.dart`
- `flutter_application_1/lib/data_collection/data_collection_model.dart`
- `flutter_application_1/lib/data_collection/data_collection_screen.dart`
- `flutter_application_1/lib/main.dart`

### Data collection / upload

- `locationDistanceFilterMeters = 15`
- `sampleIntervalMs = 250`
- `reportWindowSeconds = 15`
- `queueRetryDelaySeconds = 5`
- `locationResolutionDistanceMeters = 150`
- `locationGroupPaddingMeters = 45`
- `minimumLocationGroupRadiusMeters = 40`

### Capture summarization

- `minimumSampleCount = 10`
- `smoothingWindowSize = 5`
- `winsorizeLowerQuantile = 0.05`
- `winsorizeUpperQuantile = 0.95`

### Procedural surface / signal model

- `noiseFloor = 0.08`
- `smoothingFactor = 0.18`
- `peakThreshold = 0.58`
- `peakRiseDelta = 0.1`
- `peakCooldownMs = 320`
- `rippleSpeed = 0.00022`
- `rippleDecayMs = 2800`
- `rippleWidth = 0.085`
- `maxActiveRipples = 6`
- `baseAmplitude = 0.02`
- `rippleAmplitude = 0.085`
- `lineCount = 14`
- `minDecibels = 34`
- `maxDecibels = 86`
- `quietThreshold = 0.26`
- `moderateThreshold = 0.5`
- `livelyThreshold = 0.74`

### Mobile map/search UI

- `defaultMaxRadiusMeters = 300`
- `maxRadiusMetersCeiling = 500`
- `searchDebounceMs = 180`
- `filterDebounceMs = 250`

## Web Frontend

Current live sources:

- `Web_Frontend/src/lib/googleMaps.ts`
- `Web_Frontend/src/components/map/MapMarkers.tsx`
- `Web_Frontend/src/components/map/MapExplorer.tsx`
- `Web_Frontend/src/components/admin/AdminLocationDetail.tsx`
- `Web_Frontend/src/components/admin/AdminReportTable.tsx`
- `Web_Frontend/src/lib/adminGeometry.ts`
- `Web_Frontend/src/pages/admin/RedrawGroupPage.tsx`
- `Web_Frontend/src/pages/admin/SplitGroupPage.tsx`

### Map/search UX

- `defaultZoom = 15`
- `locationZoomThreshold = 17`
- `searchDebounceMs = 180`
- `adminReportSearchDebounceMs = 300`
- `adminReportPageSize = 50`

### Admin geometry

- `circlePolygonSegments = 8`
- `vertexSnapThresholdDeg = 0.0001`
- `boundarySnapThresholdDeg = 0.0005`
- `boundaryNodeSpacingMeters = 12`
- `defaultMaxRadiusMeters = 60`

## Known Divergences To Resolve

- Location-resolution distance differs by layer:
  - shared canonical TS: `100`
  - server JS/service: `150`
  - Flutter workflow: `150`
- Staleness/freshness currently means different things:
  - display/admin live recency: `2880` minutes
  - A1 archive cutoff: `3` hours
  - A1 group recency weighting: `3` minutes
- A1 defaults exist in both:
  - `shared/src/uml_service_layout.ts`
  - `shared/src/uml_service_layout.js`

## Suggested Extraction Order

1. Promote shared A1 math and runtime age windows into one canonical shared config surface.
2. Move server operational defaults into `server/config/runtimeConfig.js`.
3. Move location/group creation and resolution defaults into one shared location config.
4. Move Flutter capture/search constants into `flutter_application_1/lib/config/app_tuning.dart`.
5. Move web/admin UI thresholds into `Web_Frontend/src/config/uiTuning.ts`.
