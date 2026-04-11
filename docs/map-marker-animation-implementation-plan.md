# Map Marker Animation Implementation Plan

Status: Draft

Project: COP4331 Large Project / SpotStudy

## 1. Summary

This plan describes how to add synchronized animated map markers that reflect each location's qualitative noise level at load time, while preserving the current database structure and current "fetch on mount / manual refresh" model.

The recommended first implementation is:

- keep the existing coordinate-driven marker model,
- keep the current `AdvancedMarker` rendering approach in the web frontend,
- add a small set of API fields that explicitly describe marker state,
- export final composed SVG frame assets for each noise band,
- animate markers with a shared clock and crossfaded frame swaps, and
- use static SVG pins whenever a location does not have recent live data.

This plan is intentionally scoped to the current branch and current architecture, not to an older sprite-matrix concept that does not appear to exist in source today.

## 2. Current-State Findings

### 2.1 Database Structure

The database already stores the core runtime data needed for marker placement and noise-driven state selection.

`StudyLocation` currently stores:

- `studyLocationId`
- `locationGroupId`
- `name`
- `floorLabel`
- `sublocationLabel`
- `latitude`
- `longitude`
- `currentNoiseLevel`
- `currentOccupancyLevel`
- `updatedAt`

`LocationGroup` currently stores:

- `locationGroupId`
- `name`
- `centerLatitude`
- `centerLongitude`
- `radiusMeters`
- `shapeType`
- `polygon`
- `currentNoiseLevel`
- `currentOccupancyLevel`
- `updatedAt`

`Report` currently stores the raw live report data keyed by `studyLocationId`, including:

- `createdAt`
- `avgNoise`
- `maxNoise`
- `variance`
- `occupancy`
- `reportKind`

Conclusion:

- No new marker-position table is required for phase 1.
- Marker coordinates should continue to come from `StudyLocation.latitude/longitude`.
- Marker state should be derived from `currentNoiseLevel` and `updatedAt`, not from a separate animation storage layer.

### 2.2 Public Map Payload Gaps

The current public map route returns location annotations, but it is still missing several marker-specific fields that the frontend needs to render animated vs static assets cleanly.

Current issues:

- `/api/map-annotations` is location-centric and does not clearly model group markers.
- the frontend currently infers noise state from text like `noiseText` and `severity`,
- there is no explicit `hasRecentData` flag,
- there is no explicit `noiseBand` field,
- there is no explicit marker `kind`,
- and `iconType` exists only as a placeholder / seed-level hint.

Conclusion:

- The main work should happen in the API contract and frontend marker rendering layer, not in the database schema.

### 2.3 Existing Refresh Model

The current map fetches data on mount. The chosen product behavior is:

- no client-side realtime polling,
- optional manual refresh button,
- location marker state updates only after initial load or manual reload.

Conclusion:

- animation can be fully local and deterministic after the initial dataset is loaded.
- no websocket or continuous polling system is needed for this feature.

## 3. Recommended Asset Strategy

### 3.1 Use Final Composed SVG Exports

Recommendation:

- export each runtime frame as a fully composed SVG asset.

Do not depend on raw design-tool layer stacks at runtime.

Reasoning:

- the frontend should render stable final assets, not reconstruct layered artwork,
- composed SVGs are easier to import, test, and replace,
- and this removes ambiguity around which sublayers belong to which pose.

### 3.2 Normalize All Animated Variants To 3 Final Frames

The planned motion cycle is:

- `1 -> 2 -> 3 -> 2 -> 1`

That means the implementation should treat each animated marker variant as having exactly 3 unique poses.

Recommendation:

- re-export icons 4 and 5 so they also resolve to exactly 3 final animation frames for each size/variant,
- even if the source artwork currently uses 4 larger internal layers.

Reasoning:

- the code becomes much simpler,
- all 5 noise bands can share one animation engine,
- and frame indexing remains uniform across the whole marker set.

### 3.3 Runtime Asset Set

Target runtime asset set:

- animated markers:
  - 5 qualitative noise bands
  - 3 unique frames per band
  - total: 15 animated SVG assets
- static markers:
  - 1 static group pin SVG
  - 1 static study-location pin SVG

Optional later extension:

- if group markers eventually need their own animated artwork, add a second animated asset family after phase 1 is stable.

## 4. Marker State Model

The frontend should stop deriving animation rules from display text and instead consume explicit state fields from the API.

Add the following fields to the map annotation response:

- `kind: "group" | "location"`
- `noiseBand: 1 | 2 | 3 | 4 | 5 | null`
- `hasRecentData: boolean`
- `isAnimated: boolean`
- `updatedAtIso?: string`

Field meanings:

- `kind` tells the renderer whether to use group or study-location visuals.
- `noiseBand` selects which of the 5 color/variant families to use.
- `hasRecentData` determines whether the marker should animate or fall back to a static pin.
- `isAnimated` can mirror `hasRecentData` for convenience.
- `updatedAtIso` allows debugging and future UX without parsing display strings.

Recommendation:

- keep `noiseText`, `severity`, and `updatedAtLabel` for UI display,
- but do not use them as the primary driver for marker frame selection.

## 5. Freshness Rules

The animation needs a clear definition of "recent."

Recommendation:

- reuse the same server-side stale window already used for active report logic,
- defaulting to `REPORT_STALE_MINUTES = 15`.

Behavior:

- if a location has recent live data inside the stale window:
  - set `hasRecentData = true`
  - compute `noiseBand`
  - use animated marker frames
- if a location does not have recent live data:
  - set `hasRecentData = false`
  - set `noiseBand = null` or keep a best-effort value for non-animated styling
  - render the static marker for that marker kind

Important implementation detail:

- the public map route should not silently treat old fallback seed values as equivalent to recent live readings for animation purposes.

## 6. Noise Band Mapping

Define one shared server-side qualitative band mapper from numeric noise to band `1..5`.

Example phase-1 mapping:

- Band 1: very quiet
- Band 2: quiet
- Band 3: moderate
- Band 4: busy
- Band 5: loud

Recommendation:

- compute `noiseBand` from `currentNoiseLevel` on the server,
- do not infer it from `noiseText` on the client.

Reasoning:

- it keeps frontend asset selection deterministic,
- it avoids fragile text parsing,
- and it gives one source of truth for all clients.

## 7. Group Marker Behavior

The current public map route is still mostly location-based, but the product requirement says that new `LocationGroup` records should also be able to appear as markers.

Recommendation:

- expand the map annotation route so it can emit both group and location nodes,
- following the same conceptual split already used in the admin search service.

Group marker coordinate rules:

- use explicit group center coordinates when available,
- otherwise derive group marker position from child study locations,
- do not invent a separate marker-coordinate storage model for phase 1.

Phase-1 fallback:

- if public map UX should stay location-only for now, document that group marker support is deferred and keep the API fields ready for it.

## 8. Frontend Rendering Approach

### 8.1 Recommended Approach

Use the existing `AdvancedMarker` approach and replace the current simple HTML pin visuals with an asset-driven marker visual component.

Recommended new pieces:

- `MapMarkerVisual.tsx`
- `mapMarkerAssets.ts`
- `mapMarkerAnimation.ts`

Responsibilities:

- `mapMarkerAssets.ts`
  - maps `kind + noiseBand + frame` to imported SVG assets
- `mapMarkerAnimation.ts`
  - owns shared timing helpers and frame math
- `MapMarkerVisual.tsx`
  - chooses static vs animated output for a single marker

### 8.2 Shared Synchronized Clock

The desired behavior is for all animated pins to run on the same global cycle.

Recommendation:

- use one shared frontend clock for all markers on the map page,
- do not let each marker run its own independent timer.

Phase-1 cycle:

- `1 -> 2 -> 3 -> 2 -> 1`

Suggested timing:

- 250ms to 350ms per transition step
- one full cycle around 1.25s to 1.75s

### 8.3 Crossfade Between Frames

Recommendation:

- crossfade by stacking two SVG images and animating their opacity during each frame transition.

At any given moment:

- render `currentFrame`
- render `nextFrame`
- fade from one to the other using a shared normalized progress value

This provides smoother motion than hard frame swapping without requiring a canvas renderer.

### 8.4 Static Marker Fallback

If `hasRecentData` is false:

- render a static group pin if `kind === "group"`
- render a static study-location pin if `kind === "location"`

Static pins should not pulse.

## 9. Why Not Start With A Sprite Matrix

An older concept appears to have involved a CSS matrix / spritesheet layout with rows and columns for frames and icon families.

That can work, but it is not the best first implementation for the current branch.

Reasons not to start there:

- the current source tree does not appear to include a working sprite-matrix implementation,
- the artwork is vector-based and currently not normalized,
- icons 4 and 5 already have inconsistent source layering,
- importing composed SVGs is simpler and lower-risk,
- and the current marker count is likely low enough that `AdvancedMarker` + SVG is acceptable.

Recommendation:

- start with imported composed SVG assets,
- only move to a spritesheet or overlay-canvas solution if marker count or performance actually demands it.

## 10. API Changes

### 10.1 Update Public Map Route

Update `/api/map-annotations` to emit a frontend-friendly payload.

For each marker node, include:

- `id`
- `kind`
- `lat`
- `lng`
- `title`
- `buildingName`
- `floorLabel`
- `sublocationLabel`
- `noiseText`
- `severity`
- `noiseValue`
- `noiseBand`
- `hasRecentData`
- `isAnimated`
- `updatedAtLabel`
- `updatedAtIso`

### 10.2 Add Shared Server Helpers

Add reusable helpers for:

- `isRecentReading(updatedAt)`
- `toNoiseBand(currentNoiseLevel)`
- `buildMapMarkerState(...)`

These helpers should be shared by public-map and admin-search style routes where practical.

## 11. Frontend Tasks

### Phase 1: API Contract And Refresh UX

- add `Refresh` button to the map page,
- refactor the initial fetch into a reusable `fetchLocations()` function,
- use the same function for mount and manual refresh,
- extend TypeScript types for `kind`, `noiseBand`, `hasRecentData`, and `isAnimated`.

### Phase 2: Marker Asset Registry

- add a single registry file for imported SVG assets,
- organize imports by:
  - `kind`
  - `noiseBand`
  - `frame`
- add static asset entries for group and location pins.

### Phase 3: Shared Animation Engine

- create one shared animation clock in the map page or marker layer,
- compute:
  - current frame index
  - next frame index
  - transition progress
- pass animation state to all animated markers.

### Phase 4: Marker Visual Component

- replace current `BuildingPin` and `StudyPin` visuals with asset-driven rendering,
- keep selection highlight behavior,
- keep click behavior unchanged,
- use static pins when `hasRecentData` is false,
- use animated crossfaded SVG frames when `hasRecentData` is true.

### Phase 5: Cleanup

- remove reliance on `noiseText` parsing for marker frame choice,
- keep `noiseText` only for labels and popup/list display,
- keep heat overlay behavior unchanged unless visual conflicts need adjustment.

## 12. Backend Tasks

- add explicit `noiseBand` and `hasRecentData` calculation to map annotations,
- decide whether public map should emit groups as markers in phase 1,
- if yes, include group nodes in `/api/map-annotations`,
- if no, leave route location-only but still emit the new marker-state fields,
- ensure newly created study locations appear automatically via existing DB-backed query,
- ensure newly created groups can appear once group-node emission is enabled.

## 13. Testing Plan

### Backend Tests

- map annotations return `hasRecentData = false` when `updatedAt` is null,
- map annotations return `hasRecentData = false` when `updatedAt` is older than stale threshold,
- map annotations return correct `noiseBand` for representative noise values,
- newly created `StudyLocation` records appear in map annotations,
- group nodes appear correctly if phase-1 group-marker support is enabled.

### Frontend Tests

- animated markers use the correct asset family for each `noiseBand`,
- static markers appear when `hasRecentData = false`,
- refresh button reruns the fetch and updates marker visuals,
- all animated markers share the same frame step and transition timing,
- frame crossfade does not break marker click selection.

### Manual QA

- create a new group and confirm expected public-map behavior,
- create a new study location and confirm a marker appears at the correct coordinates,
- verify a location with recent noise data loads as animated,
- verify a location without recent noise data loads as static,
- verify all animated markers stay visually synchronized across the map,
- verify frame transitions are smooth enough on desktop and mobile.

## 14. Open Decisions

- Should public map phase 1 include both group and location markers, or stay location-only while the API fields are introduced?
- What exact numeric thresholds should define bands `1..5`?
- Should static pins be tinted by the last known non-recent noise band, or use one neutral default per marker kind?
- Should selection styling be applied by CSS around the asset, or should selected-state SVGs be exported separately?

## 15. Recommended Order Of Work

1. Finalize the asset export contract:
   - 3 final composed SVG frames for each of 5 noise bands
   - 2 static SVG pins
2. Add API fields:
   - `kind`
   - `noiseBand`
   - `hasRecentData`
   - `isAnimated`
   - `updatedAtIso`
3. Add the map refresh button and reusable fetch path.
4. Add the marker asset registry and animation helpers.
5. Replace current marker visuals with asset-driven animated/static rendering.
6. Decide whether to include group markers in the public map route immediately or as a follow-up.

## 16. Final Recommendation

Proceed with:

- existing database models,
- explicit marker-state fields in the API,
- composed SVG frame exports,
- synchronized shared-clock animation,
- crossfaded frame transitions,
- and static pins for non-recent data.

Do not begin with a CSS matrix or spritesheet implementation unless asset count or runtime performance later proves the simpler SVG-based approach is insufficient.
