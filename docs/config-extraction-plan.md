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

## Phase 1: Shared A1 Canonicalization (PARTIAL)

Status:
- `shared/src/uml_service_layout.ts` is now explicitly marked as the canonical
  live source of A1 tuning defaults (see header comment on `defaultA1Config`).
- `shared/src/config/a1Tuning.ts` has been reshaped to a pure re-export: it
  imports `defaultA1Config` and `defaultSessionServiceConfig` from the canonical
  file and adds named slices (`A1_ACTIVE_FIELDS`,
  `A1_DORMANT_SESSION_CORRECTION_FIELDS`) so callers can reason about active vs
  dormant session-correction fields without duplicating literal values.
- The previously hardcoded `occupancyTrustNormalizationDivisor = 4` and
  `neutralUserWeight = 1.0` were already present in `defaultA1Config`; they are
  now documented in `A1_ACTIVE_FIELDS`.
- The location-resolution mismatch is resolved: the canonical value is `150`,
  owned by `shared/config/locationTuning.json` and consumed by both the server
  (via `server/config/runtimeConfig.js`) and Flutter mirror. The obsolete
  `100`/`150` staging constants in `a1Tuning.ts` have been removed.
- Unit suite (`unit_tests/a1_service.test.ts`) passes against the new TS.

Remaining finding (risky — not done in this pass):
- `shared/src/uml_service_layout.js` (the committed in-src compile output the
  server loads at runtime) is structurally out of sync with
  `uml_service_layout.ts`. The in-src `.js` is missing `computeHistoricalBaseline`,
  `buildArchivedSummaries`, `recalculateLocationStatus`, `updateGroupStatus`,
  `pruneExpiredReports`, and the optional `archivedSummaryRepository`
  constructor parameter of `A1Service`. The server imports
  `computeHistoricalBaseline` but receives `undefined` at runtime.
- Regenerating the in-src `.js` from the current `.ts` (or redirecting the
  server to `shared/dist/uml_service_layout`) would silently activate those
  code paths, violating Phase 1's exit criterion "runtime server behavior
  matches pre-extraction behavior". Treat this as its own PR with integration
  validation, separate from config extraction.

Exit criteria status:
- [x] active A1 defaults are defined once
- [x] location-resolution mismatch resolved
- [ ] TS/JS duplication removed (blocked on the risk above — tracked as follow-up)

## Phase 3: Location and Boundary Defaults (DONE for shared rules)

Status:
- The three cross-platform domain rules
  (`nearestResolutionDistanceMeters`, `locationGroupPaddingMeters`,
  `minimumLocationGroupRadiusMeters`) now have a single source of truth:
  `shared/config/locationTuning.json`.
- Server side: `server/config/runtimeConfig.js` loads the JSON and populates
  `SERVER_RUNTIME_CONFIG.location.*` from it.
- Flutter side: `MobileCaptureTuning` in
  `flutter_application_1/lib/config/app_tuning.dart` documents the contract
  and mirrors the three values (Dart cannot import JSON at compile time for
  `const`). The header comment points callers at the canonical JSON.
- Platform-local defaults that were never meant to be cross-platform
  (e.g. `defaultUserCreatedLocationGroupRadiusMeters`,
  `duplicateLocationRadiusMeters`, `generatedGroupBoundarySides`) remain
  server-owned in `runtimeConfig.js`.

Follow-up (optional):
- Add a Flutter sync-check test that loads
  `shared/config/locationTuning.json` at test time and asserts the three
  `MobileCaptureTuning` fields match. This would mechanically enforce the
  contract that today relies on a doc comment.

Validation performed:
- `node server/tests/locationRoutes.integration.test.js` → all 21 tests pass.
- Server boot smoke check confirms `SERVER_RUNTIME_CONFIG.location` values
  match the JSON (`150 / 45 / 40`).

Exit criteria:
- [x] shared domain defaults defined once (JSON)
- [x] server consumes shared source
- [x] geometry-editor-only values remain local (admin UI / web tuning)

## Phase 5: Web and Admin UI Thresholds (DONE)

Status:
- The ambiguous `ADMIN_GEOMETRY_TUNING.circlePolygonSegments` (defined but
  unread because all callers passed literals) has been replaced with two
  named values that reflect the two intentionally-different use cases:
  - `previewCirclePolygonSegments: 24` — visual preview overlays
  - `workingCirclePolygonSegments: 6` — working polygons used by
    redraw/split geometry computation
- `polygonFromCircle` now requires `segments` explicitly (no default), and
  all five callers in `GroupBoundaryOverlays.tsx`, `SplitGroupPage.tsx`, and
  `RedrawGroupPage.tsx` consume the named tuning values.
- All other fields in `ADMIN_GEOMETRY_TUNING` (`vertexSnapThresholdDeg`,
  `boundarySnapThresholdDeg`, `boundaryNodeSpacingMeters`,
  `defaultMaxRadiusMeters`) were already wired to their consumers.

Validation:
- `tsc -b` in `Web_Frontend/` shows no new errors (only two pre-existing
  unused-import errors in `MapExplorer.tsx`, unrelated to this change).

Exit criteria:
- [x] interaction thresholds live in one web config module
- [x] every value in `uiTuning.ts` is actually read by its consumers
- [x] map/admin behavior is unchanged (preview = 24, working = 6, same as before)

## Recommended PR Breakdown

Remaining PR:
- Resolve the `shared/src/uml_service_layout.js` vs `.ts` drift (Phase 1
  follow-up). The risk is real: the committed in-src `.js` is missing several
  methods and exports that the current `.ts` defines, and the server already
  imports one of them (`computeHistoricalBaseline`) as `undefined`. Options:
  either regenerate the in-src `.js` from the current TS and validate the
  activated code paths against integration tests, or redirect the server's
  require path to `shared/dist/uml_service_layout` and add a build step.
  Either way, this needs its own PR with regression coverage.

Completed in-tree (prior PRs + this pass):
- Phase 1 value-level canonicalization (this pass)
- Phase 3 shared location domain rules via `shared/config/locationTuning.json`
  (this pass)
- Phase 5 admin geometry tuning cleanup (this pass)

## Next Steps: Testing

Config-plumbing work is in place. Before any further consolidation or the
Phase 1 follow-up PR, lock in current behavior with the existing test
surfaces (cf. `docs/project-memory-index.md` → Testing Surface):

1. A1 unit harness
   - `cd unit_tests && npm run build && npm run test`
   - confirms `shared/src/uml_service_layout.ts` + the reshaped
     `shared/src/config/a1Tuning.ts` still match Phase 1 defaults
   - re-run `npm run calibrate` against
     `calibration/tuning_profile.example.json` if tuning-adjacent values move

2. Backend integration tests (`server/tests/`)
   - `node server/tests/locationRoutes.integration.test.js` — exercises the
     shared `locationTuning.json` path through `runtimeConfig.js` (Phase 3)
   - `node server/tests/reportRoutes.integration.test.js`
   - `node server/tests/reportProcessing.integration.test.js`
   - `node server/tests/adminSearchRoutes.integration.test.js`
   - goal: prove the JSON-backed location defaults and the A1 re-export
     produce identical request/response behavior to pre-extraction

3. Web frontend typecheck + admin geometry smoke
   - `cd Web_Frontend && npx tsc -b`
   - manually exercise `/admin/redraw/:groupId` and `/admin/split/:groupId`
     in `npm run dev` to confirm preview (24-segment) vs working
     (6-segment) polygons render unchanged (Phase 5)

4. Flutter mirror check
   - ask the user to run `flutter test` in `flutter_application_1/`
     (Flutter CLI is not available in-sandbox)
   - if the optional Phase 3 follow-up lands, the new sync-check test
     will load `shared/config/locationTuning.json` and assert
     `MobileCaptureTuning` matches

5. Sign-off gate for the Phase 1 follow-up PR
   - only attempt the `uml_service_layout.js` vs `.ts` drift fix after
     steps 1–3 are green on `main`, so any regression from that PR is
     attributable to the drift fix and not to residual extraction work

## After Extraction

Once the plumbing is complete and the tests above are green:

1. review whether the three different freshness windows are all intentional
2. decide whether display staleness, archive cutoff, and group recency should remain separate
3. review current default A1 parameters against preliminary gathered data
4. only then start changing actual tuning values
