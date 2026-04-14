# Dynamic Port Feasibility Report

Audit date: 2026-04-13
Last updated: 2026-04-13 (post-port review)

Scope:

- review the `abandoned-icons` tag and the commit it points to
- assess whether the web-style dynamic map icons are worth reviving in the app
- assess whether the web data-collection dynamic mic should be ported into the app

## Status

- Section 1 (dynamic map icons): **selected-state port complete and passing on device.** Remaining open question is whether to push for per-frame smooth crossfade — see updated guidance below.
- Section 2 (dynamic mic on data collection): **not yet started.** Recommendation unchanged.

## Executive Summary

### 1. Dynamic map icons

Recommendation: **Yes, worth pursuing**

Why:

- The `abandoned-icons` tag does **not** look like evidence that the idea was fundamentally too slow.
- It points to the tail end of an `app-dynamic-icons` branch whose last tagged change was selected-state polish, not a broad rollback or a performance-failure commit.
- Current app code already contains most of the migration groundwork: `flutter_svg`, imported marker assets, marker state fields on `MapNode`, a shared animation helper, and widget tests for asset lookup and animation-state math.
- The real risk is not feasibility. It is that **true smooth crossfades in Flutter will cost more than the web version**, because the web offloads the marker halo animation to CSS while the Flutter port currently avoids per-frame updates.

Bottom line:

- finishing the port is feasible
- blindly resurrecting the tagged branch is not the right move
- the feature should be revived with a profiling-first scope and a willingness to simplify the animation if needed

### 2. Dynamic mic on data collection

Recommendation: **Yes, if the app screen is intentionally simplified for parity**

Why:

- If the product direction is parity through simplification, the dynamic mic is no longer just decorative. It becomes the primary start/stop control model for the whole screen.
- The app already has the required underlying capability: live microphone capture, location locking, session start/stop logic, and location resolution.
- The main work is UI convergence: use the mic icon as the start/stop affordance, use a location-selection popup, and remove development-style operational/status widgets that do not belong in the parity surface.

Bottom line:

- do **not** keep the current heavier app surface if parity is the goal
- do port the dynamic mic interaction model together with a simplified screen structure

---

## 1. Dynamic Map Icons

### What the `abandoned-icons` tag actually shows

The tag points to commit `f258cfbb64969471a08ec972e3cf712de9145c42`, a merge on the `app-dynamic-icons` line of work.

Important detail:

- the tagged merge itself only pulls in selected-state styling for `map_marker_widget.dart`
- the branch history immediately before it includes:
  - parity/docs planning work
  - marker asset and animation tests
  - dynamic icon WIP commits

That means the tag reads more like:

- "this branch stopped before final polish/verification"

not like:

- "we proved this is too slow and had to abandon it"

That distinction matters. The tag is weak evidence for infeasibility.

### Current app state

The current Flutter app has the full ported shape as of this update:

- `flutter_application_1/pubspec.yaml`
  - includes `flutter_svg`
  - registers `assets/map_markers/animated/` and `assets/map_markers/static/`
- `flutter_application_1/lib/main.dart`
  - stores `noiseBand`, `hasRecentData`, `isAnimated`, and `updatedAtIso` on `MapNode`
  - creates a shared `MarkerAnimationClock`
  - renders markers through `MapMarkerVisual`
- `flutter_application_1/lib/map_search/`
  - contains asset lookup, animation-state, and marker widget files
  - `MapMarkerVisual` now applies the web-parity selected-state treatment
    (`Transform.scale(1.15)` + `ImageFiltered` blur over an SVG-alpha silhouette)
- `flutter_application_1/test/`
  - unit tests for asset lookup and animation-state math
  - widget tests for static, animated crossfade, and selected-state paths

So the base port is no longer outstanding. Plumbing, visuals, and selection polish are all wired up.

### Performance concerns

#### Concern 1: Flutter does not get the same cheap animation path the web gets

The web marker implementation is light because the three halo frames are stacked once and animated with CSS keyframes. React does not need to re-render every marker during the animation cycle.

The Flutter port cannot rely on CSS. If you want a truly smooth crossfade, Flutter has to repaint or rebuild animated marker layers over time.

Implication:

- the exact web visual effect is inherently more expensive in Flutter than in the web client

#### Concern 2: the current Flutter clock is cheap partly because it is not fully animating

`computeAnimationState()` supports continuous `progress`, but `MarkerAnimationClock` only calls `onStateChanged` when the 800 ms animation step changes.

That keeps page-level `setState()` frequency low, which is good for performance, but it also means the app never receives continuously advancing progress values for a real smooth crossfade.

Implication:

- current code avoids the worst rebuild pressure
- but it also strongly suggests the remaining "make this actually animate smoothly" step is the part that was still unresolved

#### Concern 3: selected-state blur is the most suspicious extra cost, not the base icon system

The tagged commit adds web-parity selected-state treatment using:

- `Transform.scale`
- a blurred shadow layer
- a second SVG used as the alpha source for the blur

That is probably acceptable for one selected marker at a time. It would be a bad idea as a general effect across all markers.

Implication:

- base animated icons are the main feature
- the selected-state blur should be treated as optional polish, not part of the minimum viable port

**Post-port observation:** selection is constrained to a single marker by
`_selectedId`, so the blur runs at most once on screen. Device verification
shows no jank from this path. Concern stands as a guardrail: if selection
is ever extended to multi-select or hover-style highlight, revisit.

#### Concern 4: SVG layer count matters when marker count is high

Animated Flutter markers currently use two `SvgPicture.asset` layers per marker for the crossfade. If the screen shows a lot of visible markers at once, that multiplies quickly.

Risk increases when all of these are true at the same time:

- many markers visible
- many markers animated
- smooth per-frame updates enabled
- map panning/zooming active

Implication:

- the feature is feasible
- but it should be profiled on representative low/mid mobile hardware before shipping exact parity

### Migration friction

#### Friction 1: lower than it first appears

Most of the migration pain has already been paid:

- dependency added
- assets imported
- marker-state fields parsed
- marker widget extracted
- tests added for the stable non-UI pieces

That is a strong argument for finishing rather than throwing the work away.

#### Friction 2: the remaining port surface is now narrow

After this pass, parity state is:

- `MapMarkerVisual` applies the selected-state treatment (scale + blurred SVG-alpha shadow). **Done.**
- widget tests cover static, animated crossfade, and selected-state paths. **Done.**
- animation clock still favors low update frequency (step-boundary ticks) over continuous per-frame progress. **Open.**

So the only remaining port decision is the continuous-crossfade question:

- Keep the current step-boundary clock (cheap, visually stepped)?
- Or switch to per-frame `setState` / a dedicated animation controller to drive smooth progress?

Device verification on the current stepped form shows it is already acceptable
for normal marker density. The smooth-crossfade upgrade is a separate judgement
call, not a blocker.

#### Friction 3: the app map is not using the same rendering trick as the web

The web version gets away with CSS-driven animation. The app version sits on a Flutter overlay stack above `GoogleMap`.

That means the app needs its own rendering compromise:

- either full smooth crossfades with profiling
- or a simplified stepped animation / static halo fallback

### Overall guidance

Recommendation: **Done, with one optional upgrade outstanding.**

Status of the original six-step stance:

1. Keep the current overlay-marker architecture. **Held.**
2. Do not revive the tagged branch verbatim. **Followed — selected-state ported cleanly onto the current HEAD rather than cherry-picking the whole merge.**
3. Treat selected-state blur as optional polish. **Shipped with it; verified at single-selection scale.**
4. Make the feature correct and bounded. **Done — animated/static switch, tap targets, and zoom behavior verified.**
5. Profile smooth animation on device. **Current stepped animation profiled and acceptable; full smooth crossfade not yet attempted.**
6. Simplify the animation if profiling is bad. **Not needed so far.**

Practical call:

- **feature is shipped and validated at the stepped-animation tier**
- **smooth per-frame crossfade remains a separate, optional upgrade** — only pursue if the stepped cadence looks cheap next to the web version in side-by-side review

---

## 2. Dynamic Mic On Data Collection

### What the web feature actually is

The web data-collection mic is mostly a presentation feature:

- marker SVG tier chosen from live dB
- marker variant cycles every 750 ms
- microphone glyph sits over the marker
- active state adds a pulsing glow

It works well on the web because it doubles as the primary session CTA in a simpler data-collection layout.

### Current app state

The Flutter app is already much more capable operationally than the web flow:

- live microphone capture through `NoiseMeter`
- continuous location stream and location-group locking
- capture windows and draft generation
- Android background collection support
- queued retry behavior
- custom-painted procedural background
- custom-painted noise bar

The current app UI is also structurally different:

- large procedural mic/orb centerpiece
- dedicated status, noise, occupancy, location, and capture-control cards
- explicit Start/Stop buttons instead of one central web-style mic CTA

That difference matters more now, because the target is no longer "preserve the richer app UI and maybe borrow a web flourish." The target is to simplify the app screen toward the web interaction model.

### Performance concerns

#### Concern 1: the app is already spending more rendering budget than the web

`DataCollectionScreen` starts a `Ticker` and calls `setState()` on every tick to advance the procedural surface frame.

It also listens to `NoiseMeter` updates and runs a capture timer for report windows.

Implication:

- the screen is already animation-heavy
- any new visual port should be very localized so it does not further widen the rebuild surface

#### Concern 2: the dynamic mic itself is not the expensive part

Compared with the current Flutter screen, the web dynamic mic is small:

- one marker asset swap cadence
- one overlaid mic glyph
- one active pulse effect

If implemented as a focused widget, this is unlikely to be the performance bottleneck.

Implication:

- performance is not the main blocker
- the main requirement is to localize the dynamic mic so it replaces existing controls instead of layering on top of them

#### Concern 3: a naive page-level port would be sloppy

If the mic animation is wired through the whole page state instead of a local widget state or a compact animation controller, it would add avoidable rebuild churn to an already busy screen.

Implication:

- any adaptation should be isolated to the control itself
- this is manageable, but it is work for a feature that does not add app capability

### Migration friction

#### Friction 1: the logic is easy, and the UX target is now clearer

The app already has everything needed to drive the visual:

- live audio level
- capture active/stopped state
- permission state

So the technical mapping is straightforward.

With the clarified direction, the placement question is mostly resolved:

- replace the current Start/Stop buttons with the dynamic mic control
- open a location-selection popup when session start needs location confirmation
- remove development-style status/detail widgets from the main parity screen

That reduces ambiguity and lowers migration friction.

#### Friction 2: simplifying the screen means removing app-only operational clutter

Right now the app screen still exposes several widgets that read like development or operator surfaces rather than parity UI:

- decibel readout
- qualitative noise bar
- capture status
- capture history
- explicit capture controls
- draft review / queued-report summaries
- coordinate / studyLocationId detail chips

If parity is the goal, those elements create the most friction, not the dynamic mic itself.

#### Friction 3: parity now has real product value, but only if the simplification is real

Porting only the mic art while leaving the rest of the heavy app scaffolding in place would produce an awkward hybrid.

Porting the mic interaction together with screen simplification would produce:

- clearer parity between web and app
- one obvious start/stop control
- less operator-style UI on the main capture surface

That is a better return on effort than a cosmetic-only port.

### Overall guidance

Recommendation: **Yes, with simplification**

Reason:

- the port is technically feasible
- and it now matches the stated product direction
- but it should arrive as a simplified parity screen, not as an extra widget on top of the current one

Recommended shape:

- use the dynamic mic icon as the primary start/stop session control
- present location choice through a popup/modal flow
- keep the necessary permission and lock logic behind the scenes
- remove development-build / operator-style widgets from the default capture surface
- keep background collection and queueing as implementation behavior, not as primary on-screen furniture unless they are essential for the user moment

Bad approach:

- keep the current decibel/status/history/control stack and merely add the dynamic mic on top

Practical call:

- **worth porting**
- **only if the screen is simplified at the same time**
- **parity should drive the surface design, not just the icon art**

---

## Final Recommendations

### 1. Dynamic map icons

**Shipped.**

- selected-state treatment ported and verified on device
- stepped animation cadence deemed acceptable
- `abandoned-icons` tag did not represent a real performance wall, as the report predicted

### 2. Dynamic mic

**Yes, with simplification** (unchanged)

- worth porting if the app is converging toward parity
- replace the current Start/Stop control model with the mic icon interaction
- remove development-style widgets from the default screen

## Suggested Next Actions

1. For dynamic map icons:
   - **optional**: decide whether to upgrade from step-boundary crossfade to continuous per-frame crossfade. If you do, drive it from a dedicated `AnimationController` inside `MapMarkerVisual` (or a `RepaintBoundary`-scoped subtree) so only animated markers rebuild, not the whole map screen.
   - **optional**: reassess if selection is ever extended beyond single-marker highlight — at that point the blur cost stops being free.

2. For dynamic mic:
   - define the simplified parity surface first
   - make the mic icon the primary start/stop control
   - move location selection into a popup flow
   - remove development-build widgets from the default capture UI instead of carrying them forward
