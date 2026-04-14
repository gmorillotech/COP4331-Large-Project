# App Data Collection Screen Simplification / Parity Plan

Date: 2026-04-13

## Source Of Truth

For surface-design decisions, the current web implementation is the source of truth over `docs/port-feasibility-report.md`.

Files inspected:

- `Web_Frontend/src/components/SessionManager.tsx`
- `Web_Frontend/src/components/SessionManager.css`
- `flutter_application_1/lib/data_collection/data_collection_screen.dart`

## Confirmed Web Surface

The current web data-collection experience is a simplified three-part capture surface plus modal flows:

1. `Noise Level` column
   - live numeric dB readout
   - vertical qualitative noise bar
   - qualitative text label
   - small `Mic needed` note when microphone permission is not granted
2. `Start Session` center column
   - `Start Session` / `Recording` heading
   - short helper sentence
   - single large mic button
   - animated marker asset chosen from live dB tier
   - microphone glyph over the marker
   - active pulse while recording
3. `Occupancy` column
   - vertical occupancy bar
   - draggable/selectable occupancy control
   - occupancy labels
   - selected occupancy text

Also present on web:

- permission modal for location + microphone
- location picker modal when multiple nearby study locations are available
- location confirmation modal before recording begins
- create-location modal
- create-group modal
- transient success/error message banner
- active-session location banner shown below the main card

Not present on the default web surface:

- ready-to-capture status pill
- ripple/procedural background
- capture status card
- capture history card
- explicit start/stop card
- persistent study-location card
- Android background-mode card
- privacy/safety card
- last-report snapshot card

## Confirmed Current App Surface

The current Flutter app screen still renders the following primary/default elements:

- ready-to-capture / collecting status pill
- decibel readout card with `Live microphone input`
- qualitative noise card
- full-screen procedural background
- central stable mic orb with ripple count text
- capture status card
- capture history card
- study location card
  - dropdown
  - location status text
  - detected/locked group chips
  - add-study-area button
  - create-group button
  - retry/open-settings permission actions
  - detail text and coordinate / id chips
- occupancy card with slider
- capture controls card with Start / Stop buttons
- Android background mode card
- privacy + safety card
- last report snapshot card when a draft exists
- microphone permission gate overlay card

## User-Confirmed Removals

Remove from the app screen:

- ready to capture
- ripple background
- capture status
- capture history
- capture controls

## Parity Plan

### 1. Rebuild the default app surface around the web layout

Make the app's default capture surface match the web structure:

- left: noise level
- center: single mic CTA
- right: occupancy

Do not keep the current app card stack and place the parity mic on top of it.

### 2. Replace the current app microphone centerpiece

Remove the current procedural/ripple presentation:

- full-screen procedural background
- stable blue mic orb
- ripple count text

Replace it with the web interaction model:

- animated marker chosen from live dB tier
- mic glyph layered over it
- active-state pulse while capturing
- single tap target for start/stop

### 3. Reshape noise display to match web

Keep noise on screen, but in the web form:

- numeric dB readout
- qualitative bar
- qualitative label

This means the app should stop using the current top-of-screen `DECIBEL READOUT` and `QUALITATIVE NOISE` cards as separate app-only furniture and instead fold them into the parity surface.

### 4. Replace the persistent study-location card with the web flow

The web does not use a persistent study-location card on the main surface. It uses flow-based location handling:

- permission modal
- location picker modal
- location confirmation modal
- create-location modal
- create-group modal
- active-session location banner

Parity work should move the app toward that same flow instead of keeping the current persistent study-location control card on the default capture screen.

### 5. Remove app-only operator/development furniture from the default surface

Because the web is the source of truth, the following app-only elements should not remain on the default parity surface:

- ready-to-capture pill
- capture status card
- capture history card
- explicit capture-controls card
- study-location card
- ripple/procedural background
- stable mic orb

App behaviors behind those widgets may remain implemented, but they should not drive the default screen layout.

### 6. Keep platform behavior behind the scenes unless parity requires a visible surface

Background capture support, queueing, permission checks, and location locking can stay implemented without owning visible space on the primary screen unless the web has an equivalent visible requirement.

## Resolved Product Decisions

These parity decisions are now confirmed:

1. Keep the `Privacy + Safety` card for now, even though the web has no equivalent.
2. Remove the `Android Background Mode` card from the default surface. Replace it with temporary/disappearing session-start text: `you can use your phone, and StudySpot will run in the background`.
3. Remove the `Last Report Snapshot` card. It is diagnostic UI, not parity UI.
4. Keep the dedicated recovery card for denied/unavailable microphone states rather than relying on modal flow alone.

## Recommended Implementation Order

1. Remove the ready-state pill, ripple background, capture status card, capture history card, and capture controls card.
2. Replace the current center orb with the web-style animated mic CTA.
3. Recompose noise UI into the parity left column.
4. Recompose occupancy UI into the parity right column.
5. Replace the persistent study-location card with modal/banner flow.
6. Keep the privacy card, replace the Android background card with temporary session-start copy, remove the last-report snapshot card, and retain the microphone recovery card.
