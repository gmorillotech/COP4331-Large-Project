# Constants Unification Review

Date: 2026-04-11
Branch/worktree context: staged changes on `constants-unification`

## Findings

### 1. Verification-code length is configurable on the backend, but the web and Flutter clients still hardcode "6-digit" UX copy

The backend now treats verification-code length as a runtime setting through `SERVER_RUNTIME_CONFIG.auth.verificationCodeDigits`, and both auth email flows generate codes from that setting. However, the user-facing auth flows in both clients still repeatedly instruct users to enter a "6-digit" code and use "6-digit code" placeholders.

Why this matters:
- If `verificationCodeDigits` is changed away from `6`, the backend and email copy will shift immediately.
- The web and mobile apps will still tell users to enter six digits, which creates a misleading reset/verification flow right when the user is already in a sensitive auth path.

Relevant references:
- `server/config/runtimeConfig.js:28`
- `server/controllers/authController.js:12`
- `server/services/adminUserService.js:12`
- `Web_Frontend/src/components/Login.tsx:191`
- `Web_Frontend/src/components/Login.tsx:566`
- `flutter_application_1/lib/auth/login_page.dart:181`
- `flutter_application_1/lib/auth/login_page.dart:351`

Suggested fix:
- Either keep the code length fixed at six everywhere and remove the new configurability, or expose the configured digit count to both clients so their messaging stays aligned with the backend.

### 2. `REPORT_STALE_MINUTES` still has two sources of truth on the server

This branch introduces `server/config/runtimeConfig.js` and moves admin search over to `SERVER_RUNTIME_CONFIG.display.reportStaleMinutes`, but the main server entrypoint still imports `REPORT_STALE_MINUTES` from the older `server/config/appConfig.js`.

Why this matters:
- The branch goal is constant unification, but this leaves the stale-report timeout split across two config modules.
- Today both modules resolve to the same env/default value, so behavior does not diverge yet. The risk is that the next edit updates only one config path and silently desynchronizes map annotations from admin/report behavior.

Relevant references:
- `server/config/runtimeConfig.js:3`
- `server/config/appConfig.js:2`
- `server/server.js:25`
- `server/server.js:57`
- `server/server.js:126`
- `server/services/adminSearchService.js:12`

Suggested fix:
- Replace the remaining `appConfig` import in `server/server.js` with `SERVER_RUNTIME_CONFIG.display.reportStaleMinutes`, then remove the duplicate config file if nothing else needs it.

### 3. `ADMIN_GEOMETRY_TUNING.circlePolygonSegments` is defined but not actually used

`Web_Frontend/src/config/uiTuning.ts` adds `ADMIN_GEOMETRY_TUNING.circlePolygonSegments`, but `polygonFromCircle` still defaults to a hardcoded `segments = 8`. The pages that create default polygons rely on that implicit default rather than reading the new shared tuning value.

Why this matters:
- This is an incomplete extraction: the new config file suggests that polygon segment count is centralized, but the real behavior is still controlled by a hardcoded default in `adminGeometry.ts`.
- Someone changing `circlePolygonSegments` will reasonably expect redraw/split defaults to change, but nothing will happen unless they also change `polygonFromCircle`.

Relevant references:
- `Web_Frontend/src/config/uiTuning.ts:13`
- `Web_Frontend/src/lib/adminGeometry.ts:382`
- `Web_Frontend/src/lib/adminGeometry.ts:385`

Suggested fix:
- Wire `polygonFromCircle` to `ADMIN_GEOMETRY_TUNING.circlePolygonSegments`, or remove that setting from `uiTuning.ts` until it is truly authoritative.

## Validation Notes

- `unit_tests`: `npm test` passed locally with all 21 A1/unit tests green.
- `Web_Frontend`: `npm run build` still fails, but the failure appears to be pre-existing rather than introduced by this branch. The errors are unused `memo` and `errorMsg` symbols in `Web_Frontend/src/components/map/MapExplorer.tsx`.
