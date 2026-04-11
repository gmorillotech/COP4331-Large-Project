# App Dynamic Icons Port Plan

Status: Draft

Source: codebase audit across `Web_Frontend`, `flutter_application_1`, and `server` on 2026-04-11.

## Summary

This plan describes how to port the web app's dynamic map-marker icons into the Flutter app without changing the product behavior of the map itself.

Recommended approach:

- reuse the existing backend marker-state fields that already drive the web experience,
- reuse the existing SVG marker artwork from `Web_Frontend/src/assets/markers`,
- keep the Flutter map's current overlay-based marker rendering instead of switching to Google Maps bitmap markers,
- add a small Flutter marker-rendering layer with a shared animation clock,
- and move the custom marker drawing logic out of `flutter_application_1/lib/main.dart` into focused map-marker files.

## Current-State Findings

### Web already has the marker system we want

The website already contains the pieces the app needs to mirror:

- `Web_Frontend/src/components/map/mapMarkerAssets.ts`
  - maps `noiseBand + frame` to the `1-1.svg` through `5-3.svg` asset set
- `Web_Frontend/src/components/map/mapMarkerAnimation.ts`
  - defines the shared ping-pong animation sequence `0 -> 1 -> 2 -> 1`
- `Web_Frontend/src/components/map/MapMarkerVisual.tsx`
  - switches between animated marker frames and static fallback pins

That means the app port is mainly a Flutter rendering task, not a product-design task.

### The backend is mostly ready already

The server already exposes the explicit state fields that the web marker system uses:

- `kind`
- `locationGroupId`
- `noiseBand`
- `hasRecentData`
- `isAnimated`
- `updatedAtIso`

These fields are built in:

- `server/server.js`
- `server/services/mapSearchData.js`

So phase 1 should assume no backend redesign is required unless the Flutter app discovers a contract mismatch during implementation.

### The Flutter app still renders handcrafted pins

The Flutter map currently draws marker overlays directly in `flutter_application_1/lib/main.dart`:

- `MapNode.fromJson` parses the response but does not store marker-animation fields yet
- `_overlayMarker()` assembles the visible marker
- `_pinGlyph()` draws the rotated pin shell and text badge
- `_soundBadge()` draws the circular sound icon badge

This means the app is still using a custom generated marker style rather than the web's asset-driven visuals.

### The Flutter map architecture is already compatible with a port

The app currently renders markers in a positioned overlay stack above `GoogleMap`, instead of relying on native `Marker` icons from `google_maps_flutter`.

That is good for this feature because it allows:

- SVG rendering with normal Flutter widgets
- shared animation across all markers
- zoom-based sizing that matches current app behavior
- selection styling without regenerating bitmap assets on every frame

## Goals

- Match the web marker family in the Flutter map for both group and location markers.
- Animate markers only when `isAnimated == true` and `noiseBand` is present.
- Preserve current app map interactions:
  - tap to focus marker
  - zoom-based group/location behavior
  - details card behavior
  - favorites behavior
- Keep fallback behavior when the API is unavailable.
- Keep the implementation testable and avoid growing `main.dart` further.

## Non-Goals

- Rebuilding the map around Google Maps native marker APIs.
- Redesigning the website marker system.
- Changing clustering, filtering, or favorites behavior.
- Reworking the backend marker-state model unless a concrete app gap is found.

## Recommended Implementation Shape

### 1. Add Flutter marker domain fields

Extend `MapNode` so Flutter stores the same marker-state fields already used on the web:

- `noiseBand`
- `hasRecentData`
- `isAnimated`
- `updatedAtIso`
- `locationGroupId` or align it with the current `groupId` field

Also make the fallback seeded nodes populate these fields explicitly so offline/demo mode still renders deterministically.

### 2. Add a Flutter asset registry for the web SVGs

Create a dedicated asset folder in the Flutter app, for example:

- `flutter_application_1/assets/map_markers/animated/`
- `flutter_application_1/assets/map_markers/static/`

Then copy or script-sync these files from the website marker set:

- animated frames: `1-1.svg` through `5-3.svg`
- static pins:
  - `LocationPin.svg`
  - `subLocationPin.svg`

Add them to `flutter_application_1/pubspec.yaml`.

Recommendation:

- use `flutter_svg` to render the SVG files directly,
- keep the asset naming aligned with the web set,
- and centralize lookup in a Dart registry instead of scattering string paths through the widget tree.

Suggested files:

- `flutter_application_1/lib/map_search/map_marker_assets.dart`
- `flutter_application_1/lib/map_search/map_marker_types.dart`

### 3. Port the shared animation model from web to Flutter

Recreate the web timing model in Dart:

- sequence: `0 -> 1 -> 2 -> 1`
- one shared animation clock for the whole map screen
- return:
  - `currentFrame`
  - `nextFrame`
  - `progress`

Recommended implementation:

- create a small `MarkerAnimationState` model,
- drive it with a single `AnimationController` or ticker-owned clock in `MapSearchPage`,
- and pass the same state into every animated marker widget.

Suggested file:

- `flutter_application_1/lib/map_search/map_marker_animation.dart`

### 4. Replace `_pinGlyph()` and `_soundBadge()` with asset-driven marker widgets

Introduce a dedicated marker widget that mirrors `MapMarkerVisual.tsx`.

Suggested file:

- `flutter_application_1/lib/map_search/map_marker_widget.dart`

Responsibilities:

- choose static vs animated rendering
- choose location vs sublocation pin family
- crossfade `currentFrame` and `nextFrame`
- apply selected-state sizing or highlight treatment
- preserve transparent hit area and current overlay positioning rules

Recommended first version:

- stack two `SvgPicture.asset` widgets
- animate their opacity using the shared `progress`
- keep current size calculations from `_overlayZoomScale()`

## Proposed Phases

### Phase 1: Data Contract Parity In Flutter

- Add marker-state fields to `MapNode`.
- Parse `noiseBand`, `hasRecentData`, `isAnimated`, `updatedAtIso`, and `locationGroupId` from API JSON.
- Update `_fallbackNodes()` to assign sensible values for the same fields.
- Decide whether `groupId` should be renamed to `locationGroupId` for consistency or preserved with a mapping layer.

Deliverable:

- Flutter state can represent the same marker states the web app already uses.

### Phase 2: Asset Import Pipeline

- Add `flutter_svg` to `pubspec.yaml`.
- Create a Flutter-owned marker asset directory.
- Copy the web marker SVGs into the Flutter app.
- Register the assets in `pubspec.yaml`.
- Add a registry helper that maps:
  - marker kind
  - noise band
  - frame index
  - static-vs-animated mode
    to an asset path.

Deliverable:

- a single source of truth for marker asset lookup in Flutter.

### Phase 3: Shared Animation Engine

- Port the web ping-pong animation sequence into Dart.
- Put one animation controller on the map screen instead of per marker.
- Expose a lightweight immutable animation snapshot to marker widgets.
- Pause ticker work when the screen is disposed.

Deliverable:

- all animated markers stay visually synchronized, matching the web behavior.

### Phase 4: Marker Rendering Extraction

- Move marker rendering out of `main.dart` into `lib/map_search/`.
- Replace `_pinGlyph()` and `_soundBadge()` usage inside `_overlayMarker()`.
- Keep the current overlay layout math, tap handling, and selection logic.
- Preserve different base sizes for building/group markers and spot markers.

Deliverable:

- the Flutter map renders the imported web-style markers instead of locally drawn pins.

### Phase 5: Selected-State And Zoom Tuning

- Tune marker sizing so imported assets feel balanced at current zoom levels.
- Decide how selected-state emphasis should work:
  - larger marker size only,
  - outline/glow wrapper,
  - or a combination.
- Verify the badge area and pin anchor still line up cleanly with map coordinates.

Deliverable:

- selected markers remain obvious without breaking map readability.

### Phase 6: Fallback, QA, And Cleanup

- Ensure offline/API-failure seeded nodes still produce valid marker visuals.
- Remove dead custom marker-drawing helpers if no longer needed.
- Add widget/unit tests around asset lookup and animation state math.
- Add manual QA notes for zoom, tap targeting, and mixed animated/static datasets.

Deliverable:

- the feature works with live API data and local fallback data.

## File-Level Worklist

### Flutter files to change

- `flutter_application_1/pubspec.yaml`
  - add `flutter_svg`
  - register marker asset paths
- `flutter_application_1/lib/main.dart`
  - extend `MapNode`
  - wire shared animation state into map rendering
  - replace old overlay marker composition
  - remove obsolete marker helper methods after extraction

### Flutter files to add

- `flutter_application_1/lib/map_search/map_marker_types.dart`
- `flutter_application_1/lib/map_search/map_marker_assets.dart`
- `flutter_application_1/lib/map_search/map_marker_animation.dart`
- `flutter_application_1/lib/map_search/map_marker_widget.dart`

### Assets to add

- `flutter_application_1/assets/map_markers/...`

### Backend files to verify, not necessarily change

- `server/server.js`
- `server/services/mapSearchData.js`

## Risks And Decisions

### SVG support risk

The Flutter app does not currently declare `flutter_svg`, so SVG rendering is a new dependency.

Recommendation:

- use `flutter_svg` first because it keeps parity with the web source assets,
- and only switch to pre-rendered PNGs if performance on target devices proves unacceptable.

### Main file size risk

`flutter_application_1/lib/main.dart` is already carrying map state, overlay rendering, favorites behavior, and detail card rendering.

Recommendation:

- keep this change from adding more marker code to `main.dart`,
- extract the marker-specific types and widgets as part of the port instead of as a later cleanup task.

### Fallback-data drift risk

The seeded fallback nodes were created before the web marker-state model existed.

Recommendation:

- explicitly assign marker-state fields in `_fallbackNodes()`,
- and keep at least one seeded node for each of:
  - animated marker
  - static marker
  - location marker
  - group marker

### Selection-style decision

The web selected state currently depends partly on size growth and CSS class styling. Flutter will need an equivalent.

Recommendation:

- begin with size growth plus a subtle wrapper decoration,
- avoid exporting a second selected-only asset family unless design says it is necessary.

## Testing Plan

### Unit tests

- asset registry returns the correct file for each `noiseBand` and frame
- animation state produces the expected ping-pong sequence
- `MapNode.fromJson` handles missing marker-state fields safely

### Widget tests

- animated marker renders two SVG layers and crossfades between them
- static marker renders one pin asset when `isAnimated` is false
- group and location markers use the expected base sizing
- selected marker styling still appears when tapped

### Manual QA

- compare web and app side by side for the same dataset
- verify quiet, moderate, and loud markers choose the expected asset family
- verify stale data falls back to static pins
- verify group markers still appear at low zoom and location markers at high zoom
- verify marker taps still open the same details card content
- verify fallback seeded mode still renders markers when the API is unavailable

## Acceptance Checklist

- [ ] Flutter consumes the same marker-state fields already used by the website.
- [ ] Flutter renders the web marker asset family for both animated and static markers.
- [ ] All animated markers share one synchronized clock.
- [ ] Group/location zoom behavior stays intact.
- [ ] Marker tap targets and details-card behavior stay intact.
- [ ] Seeded fallback mode still renders valid markers.
- [ ] Marker rendering code is extracted from `main.dart` into focused `map_search` files.

## Recommended Order Of Work

1. Add marker-state fields to `MapNode` and fallback nodes.
2. Add `flutter_svg` and register the SVG asset set.
3. Build the Dart marker asset registry.
4. Build the shared animation-state helper.
5. Swap `_overlayMarker()` to use a dedicated marker widget.
6. Tune selected-state and zoom sizing.
7. Add focused tests and run manual parity checks against the web map.

## Final Recommendation

Treat this as a Flutter rendering port, not a backend rewrite.

The lowest-risk path is to keep the current overlay-marker architecture, reuse the web SVG assets and marker-state contract, and extract a small Flutter marker system under `lib/map_search/` that mirrors the web's asset registry plus shared animation clock.
