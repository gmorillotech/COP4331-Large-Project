# Config Extraction Plan

This plan turns `docs/config-inventory.md` into a concrete implementation path.

Goal:
- remove duplicated operational and algorithmic magic numbers
- establish clear config ownership by layer
- preserve current behavior while extracting values into explicit config modules

Non-goals for the first pass:
- redesigning A1 math
- changing defaults for tuning
- reviving session-correction logic
- moving every UI visual constant into config

## Guiding Rules

1. Extract without changing behavior first.
2. Move one config family at a time.
3. Keep one canonical owner per value.
4. Add tests around behavior before consolidating duplicated callers.
5. Do not mix algorithm changes with config-plumbing changes in the same PR.

## Phase 1: Shared A1 Canonicalization

Objective:
- make one canonical source for active A1 tuning values

Tasks:
- choose whether `shared/src/uml_service_layout.ts` remains the canonical live owner
  or whether `shared/src/config/a1Tuning.ts` becomes the new owner
- remove duplication between:
  - `shared/src/uml_service_layout.ts`
  - `shared/src/uml_service_layout.js`
- keep session-correction settings marked as dormant, not active
- extract the remaining hardcoded A1 values:
  - occupancy trust normalization divisor (`4`)
  - neutral user weight (`1.0`)
- resolve the location-resolution mismatch between shared TS (`100`) and runtime (`150`)

Validation:
- `unit_tests/a1_service.test.ts`
- `unit_tests/calibration/a1_calibration_harness.ts`
- `server/tests/reportProcessing.integration.test.js`

Exit criteria:
- active A1 defaults are defined once
- runtime server behavior matches pre-extraction behavior
- dormant session-correction values are still present only if intentionally retained

## Phase 2: Server Runtime Config

Objective:
- move server operational thresholds into `server/config/runtimeConfig.js`

Tasks:
- rewire callers to use runtime config for:
  - report stale minutes
  - noise thresholds
  - report polling interval
  - report/history fetch limits
  - admin active-report page sizes
  - auth/admin code TTL and code digit count
- stop hardcoding route limits in controllers where they represent policy, not query shape
- keep environment-backed values in server config, not spread across services/controllers

Primary files:
- `server/config/appConfig.js`
- `server/config/runtimeConfig.js`
- `server/server.js`
- `server/services/reportProcessingService.js`
- `server/services/adminSearchService.js`
- `server/controllers/reportController.js`
- `server/controllers/authController.js`
- `server/services/adminUserService.js`

Validation:
- `node server/tests/reportRoutes.integration.test.js`
- `node server/tests/locationRoutes.integration.test.js`
- `node server/tests/adminSearchRoutes.integration.test.js`

Exit criteria:
- server operational thresholds are read from one runtime config module
- `appConfig.js` is either reduced to display-only compatibility or folded into runtime config cleanly

## Phase 3: Location and Boundary Defaults

Objective:
- unify location/group creation and resolution constants across server, shared, Flutter, and admin tools

Tasks:
- extract and standardize:
  - nearest-resolution distance
  - location-group padding
  - minimum group radius
  - default user-created group radius
  - duplicate-location collision radius
  - generated boundary shape sides/segments
- decide which values are:
  - shared domain rules
  - server-only operational defaults
  - admin-geometry/editor affordances
- rewire server `LocationService`
- rewire Flutter `LocalStudyLocationResolver`
- rewire admin redraw/split helpers where appropriate

Primary files:
- `server/services/locationService.js`
- `shared/src/config/a1Tuning.ts`
- `flutter_application_1/lib/data_collection/data_collection_workflow.dart`
- `Web_Frontend/src/lib/adminGeometry.ts`
- `Web_Frontend/src/pages/admin/RedrawGroupPage.tsx`
- `Web_Frontend/src/pages/admin/SplitGroupPage.tsx`

Validation:
- `node server/tests/locationRoutes.integration.test.js`
- manual admin boundary checks in redraw/split flows
- Flutter location-resolution smoke check

Exit criteria:
- same domain default is not defined separately in server and Flutter
- geometry-editor-only values remain local to admin UI unless needed elsewhere

## Phase 4: Mobile Capture and Search Tuning

Objective:
- move mobile operational thresholds into `flutter_application_1/lib/config/app_tuning.dart`

Tasks:
- rewire Flutter callers to use app tuning for:
  - sample interval
  - report window
  - queue retry delay
  - location distance filter
  - search/filter debounce
  - search radius defaults/ceiling
  - procedural surface constants
  - capture summarization defaults
- decide which mobile values should mirror shared summarization defaults and which are mobile-specific

Primary files:
- `flutter_application_1/lib/config/app_tuning.dart`
- `flutter_application_1/lib/data_collection/data_collection_screen.dart`
- `flutter_application_1/lib/data_collection/data_collection_workflow.dart`
- `flutter_application_1/lib/data_collection/data_collection_model.dart`
- `flutter_application_1/lib/main.dart`

Validation:
- relevant Flutter widget/unit tests
- manual capture session
- manual map-search interaction on device/emulator

Exit criteria:
- mobile behavior constants are not buried inside widgets/models
- mobile search and capture timings are easy to review and tune

## Phase 5: Web and Admin UI Thresholds

Objective:
- consolidate map/admin interaction thresholds into `Web_Frontend/src/config/uiTuning.ts`

Tasks:
- rewire:
  - default zoom
  - group/location zoom threshold
  - search debounce
  - admin location-detail debounce
  - admin report page size
  - admin geometry snapping thresholds
  - default redraw/split fallback radius
- leave purely visual constants alone unless they represent product policy

Primary files:
- `Web_Frontend/src/config/uiTuning.ts`
- `Web_Frontend/src/lib/googleMaps.ts`
- `Web_Frontend/src/components/map/MapMarkers.tsx`
- `Web_Frontend/src/components/map/MapExplorer.tsx`
- `Web_Frontend/src/components/admin/AdminLocationDetail.tsx`
- `Web_Frontend/src/components/admin/AdminReportTable.tsx`
- `Web_Frontend/src/lib/adminGeometry.ts`

Validation:
- web build
- search/map manual smoke checks
- admin search/detail/manual geometry flows

Exit criteria:
- interaction thresholds live in one web config module
- map/admin behavior is unchanged from before extraction

## Recommended PR Breakdown

PR 1:
- shared A1 canonicalization
- no server/mobile/web rewiring beyond what is required to consume the canonical shared values

PR 2:
- server runtime config extraction

PR 3:
- location/boundary default unification

PR 4:
- Flutter config extraction

PR 5:
- web/admin config extraction

## After Extraction

Once the plumbing is complete:

1. review whether the three different freshness windows are all intentional
2. decide whether display staleness, archive cutoff, and group recency should remain separate
3. review current default A1 parameters against preliminary gathered data
4. only then start changing actual tuning values
