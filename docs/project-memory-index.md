# Persistent Project Memory Index

Last updated: 2026-04-13

This file is an explicit, human-readable stand-in for the kind of "project memory"
people often assume a coding agent keeps automatically. It captures the repository's
identity, layout, major systems, important docs, and the local quirks that matter
when returning to the project later.

## Project Identity

- Repository name: `COP4331-Large-Project`
- README branding: `Decibel Tracker`
- In-app/auth branding seen in code: `StudySpot`
- Domain: UCF campus study-space discovery, live reporting, and admin management
- Core idea: track study locations, noise levels, occupancy, favorites, profile
  settings, and admin operations across web, mobile, and backend surfaces

## Tech Stack

- Backend: Node.js + Express 5 + MongoDB/Mongoose + JWT
- Web frontend: React 19 + Vite + TypeScript
- Mobile app: Flutter + Dart
- Maps:
  - web: `@vis.gl/react-google-maps`
  - mobile: `google_maps_flutter`
- Supporting mobile libraries: `flutter_svg`, `geolocator`, `noise_meter`,
  `permission_handler`, `provider`, `shared_preferences`, `url_launcher`

## Top-Level Repository Layout

- `README.md`: high-level project overview and local dev commands
- `server/`: Express API, Mongo models, routes, repositories, services, tests
- `Web_Frontend/`: React/Vite website, including admin UI and web data collection
- `flutter_application_1/`: Flutter app for auth, map exploration, data collection,
  favorites, and account-center work
- `shared/`: shared TypeScript artifacts and tuning/config inputs for A1 work
- `unit_tests/`: TypeScript-based A1 build/test harness and calibration tooling
- `docs/`: current worktree docs (memory index plus feasibility analysis)
- `design_mockups/`: SVG mockups for the data-collection experience
- `.github/`: CI/deployment workflow(s)
- `.claude/`: local agent/tooling folder, including mirrored worktree content
- `.obsidian/`: local Obsidian vault settings
- `Algorithm-A1.drawio.pdf`: architecture/design diagram artifact

## What Each Major Application Does

### `server/`

Purpose:
- serves the API used by the website and Flutter app
- handles auth, profiles, locations, reports, admin operations, and map annotation
  data

Observed entrypoint:
- `server/server.js`

Key behavior:
- starts Express with CORS and JSON handling
- mounts auth, location, study-location, report, and admin route groups
- exposes `GET /api/health`
- exposes `GET /api/map-annotations`
- attempts MongoDB connection before starting
- falls back into a degraded local mode if MongoDB is unavailable outside
  production
- starts a polling loop for A1 report processing when DB connectivity is available

Main backend route groups:
- `routes/authRoutes.js`
  - register/login
  - email verification + resend flow
  - forgot/reset password flow
  - authenticated profile fetch/update + password change
- `routes/locationRoutes.js`
  - location-group listing/creation
  - create/list locations within a group
  - search + closest-location lookup
- `routes/reportRoutes.js`
  - optional-auth report submission
  - authenticated report history/recent/baseline reads
- `routes/studyLocationRoutes.js`
  - combined locations + groups dump at `GET /api/locations`
- `routes/adminRoutes.js`
- `routes/adminSearchRoutes.js`
- `routes/adminLocationRoutes.js`
- `routes/adminUserRoutes.js`

Main backend controllers:
- `controllers/authController.js`
- `controllers/locationController.js`
- `controllers/reportController.js`
- `controllers/adminSearchController.js`
- `controllers/adminLocationController.js`
- `controllers/adminUserController.js`

Main backend services:
- `services/reportProcessingService.js`
- `services/locationService.js`
- `services/locationSearchService.js`
- `services/locationSearchSource.js`
- `services/mapSearchData.js`
- `services/locationStatusText.js`
- `services/geometryValidation.js`
- `services/adminSearchService.js`
- `services/adminUserService.js`

Main backend models:
- `models/User.js`
- `models/StudyLocation.js`
- `models/LocationGroup.js`
- `models/Report.js`
- `models/ReportTagMetadata.js`
- `models/AuditLog.js`

Other notable backend files:
- `config/db.js`: database connection setup
- `config/runtimeConfig.js`: canonical server operational config (noise thresholds,
  report limits, auth TTL, location defaults)
- `middleware/authMiddleware.js`: protect/optionalProtect/admin-role middleware
- `createJWT.js`: JWT support
- `repositories/`: location and query helper abstraction layer
- `tests/`: integration coverage plus geometry/search/admin unit tests

### `Web_Frontend/`

Purpose:
- web application for login, map exploration, profile/favorites, web data
  collection, and admin tools

Observed entrypoint:
- `Web_Frontend/src/App.tsx`

Observed route structure:
- `/`: login page
- `/home`: main home/map page
- `/collect`: web data-collection page
- `/admin`: admin area behind `AdminGuard`
- `/admin/users`: user management
- `/admin/redraw/:groupId`: group redraw flow
- `/admin/split/:groupId`: group split flow
- `/admin/locations`: admin location editing

Main frontend folders:
- `src/pages/`: top-level page routes
- `src/components/`: reusable UI pieces
- `src/components/admin/`: admin-specific UI
- `src/components/map/`: map rendering, overlays, and marker presentation
- `src/lib/`: map/admin geometry helpers and Google Maps support
- `src/config/`: local/live/active frontend config targets
- `src/types/`: shared frontend types
- `src/utils/`: helpers such as email masking
- `src/assets/`: image and marker assets

Important observed frontend themes:
- map-first home experience
- favorites drawer + profile side panel on the web home page
- password-reset/profile update flows wired into the profile panel
- Google Maps based visualization with custom marker assets and overlays
- web data-collection session flow with permission gating, geolocation, occupancy
  selection, and location/group creation
- separate admin shell for search, reports, redraw/split flows, location editing,
  and user management

### `flutter_application_1/`

Purpose:
- mobile/desktop Flutter client for login, study-space map search, favorites,
  data collection, and account-center work

Observed entrypoint:
- `flutter_application_1/lib/main.dart`

Main Flutter feature areas:
- `lib/auth/`: auth service, models, login page
- `lib/map_search/`: map marker assets/animation helpers and map experience
- `lib/data_collection/`: collection workflow, render model, backend integration,
  background controller
- `lib/account_center/`: account-center page, backend calls, models
- `lib/config/`: API configuration and app tuning

Observed app behavior:
- persists auth state using `SharedPreferences`
- routes authenticated users into the map experience
- exposes authenticated routes for map, data collection, and account center
- includes seeded/fallback map records in code
- supports favorites in the map flow
- supports compile-time API base URL overrides
- documents local fallback queue behavior for data collection when backend is down
- includes Android foreground-service support for background collection
- already contains dynamic marker asset/animation plumbing for app/web parity work

### `shared/`

Purpose:
- shared TypeScript files used by the A1/unit-test toolchain

Observed contents:
- `src/uml_service_layout.ts`
- `src/uml_service_layout.js`
- `src/support_services.js`
- `src/config/a1Tuning.ts`
- `config/locationTuning.json`

### `unit_tests/`

Purpose:
- standalone TypeScript build/test harness for the A1 service and calibration work

Observed scripts:
- `npm run build`
- `npm run test`
- `npm run calibrate`

Key files:
- `a1_service.test.ts`
- `calibration/a1_calibration_harness.ts`
- `calibration/README.md`
- `calibration/tuning_profile.example.json`

Note:
- `unit_tests/dist/` and `unit_tests/node_modules/` are present locally and appear
  to be generated/dependency content rather than authored source

## Documentation Index

### Current files in `docs/`

- `docs/project-memory-index.md`
  - this persistent repository memory file
- `docs/port-feasibility-report.md`
  - 2026-04-13 feasibility review of reviving dynamic map icons and porting the
    dynamic data-collection mic into the Flutter app

### Supporting design/material docs

- `design_mockups/README.md`
  - explains the SVG mockups for the manual occupancy + microphone capture screen
- `Algorithm-A1.drawio.pdf`
  - architecture/design artifact for A1-related work

## Testing Surface

### Backend tests

Observed in `server/tests/`:
- route/integration coverage:
  - `reportRoutes.integration.test.js`
  - `reportProcessing.integration.test.js`
  - `locationRoutes.integration.test.js`
  - `adminSearchRoutes.integration.test.js`
- geometry/search/admin unit coverage:
  - `adjacentMerge.unit.test.js`
  - `mergeDiagnostics.unit.test.js`
  - `subtractPolygon.unit.test.js`
  - `unionSharedEdge.unit.test.js`
  - `snapVerticesToNeighborEdges.unit.test.js`
  - `userMergeCase.unit.test.js`
  - `mapSearchData.unit.test.js`

### Flutter tests

Observed in `flutter_application_1/test/`:
- auth/account tests
- map-search tests
- map-marker asset/animation tests
- data-collection model/render/workflow tests

Examples:
- `login_page_test.dart`
- `account_center_page_test.dart`
- `map_search_viewport_test.dart`
- `map_marker_widget_test.dart`
- `data_collection_workflow_test.dart`

### A1/unit-test harness

Observed in `unit_tests/`:
- TypeScript compile + run flow for A1 logic
- calibration support with example tuning profile

## Local Development Knowledge

### Backend

- default port in README: `5050`
- install/run:
  - `cd server`
  - `npm install`
  - `npm run dev`
- note from README: MongoDB access requires team-specific SSH tunnel details kept
  outside the repo docs

### Web frontend

- default Vite dev port in README: `5173`
- install/run:
  - `cd Web_Frontend`
  - `npm install`
  - `npm run dev`
- API requests are proxied through Vite config
- the repo-root `README.md` is the useful setup doc; `Web_Frontend/README.md`
  is still mostly the stock Vite template

### Flutter

- install/run:
  - `cd flutter_application_1`
  - `flutter pub get`
  - `flutter run`
- documented local API defaults:
  - Android emulator: `http://10.0.2.2:5050`
  - desktop/mobile local: `http://localhost:5050`
- supported Dart defines:
  - `MAP_API_BASE_URL`
  - `DATA_COLLECTION_API_BASE_URL`
  - `DATA_COLLECTION_AUTH_TOKEN`
  - `DATA_COLLECTION_USER_ID`
- Android Maps key is expected in `android/local.properties`

## Known Architectural Themes

- one backend serves both the web app and Flutter app
- the user/account model now includes favorites plus user noise/occupancy weighting
  fields
- auth is more than login/register: email verification, password reset, and
  profile maintenance are part of the active surface
- admin functionality is web-first and split across search/report, geometry, and
  user-management flows
- map-based search and map annotations are a central product concept
- live report processing and polling are part of the backend design
- data collection exists as both a web-facing page and a richer Flutter workflow
- app/web parity work is active around dynamic marker visuals and the collection
  mic interaction model

## Repo-Specific Quirks Worth Remembering

- `.claude/worktrees/agent-*` contains mirrored worktrees created by tooling; they
  are not the canonical source of truth for edits
- `.obsidian/` is editor/vault configuration, not application logic
- `unit_tests/node_modules/` and `unit_tests/dist/` exist inside the repo tree
  locally and can add noise when doing broad file scans
- the production deployment workflow lives at
  `.github/workflows/production-deploy.yml`
- the deploy workflow does a remote `git reset --hard` and `git clean -fd` on the
  production host before reinstall/build/reload
- `docs/` is currently in flux in the working tree: older tracked docs are deleted
  locally while `port-feasibility-report.md` is present as a local analysis doc
- when auditing docs, prefer a real filesystem listing over file-index-only views;
  tracked-but-deleted docs can still show up in some git-aware file queries
- credentials, SSH details, MongoDB URIs, SendGrid keys, and deployment secrets
  are intentionally not duplicated in the repository README

## What Is Not Stored Here

This index intentionally does not try to store:
- secrets or credentials
- unverified assumptions about database schema beyond observed model files/docs
- transient local state from dev servers
- full copies of generated/vendor files

## Recommended Use

Treat this file as the first-stop project memory for future work:
- read it before exploring the repo from scratch
- update it when major routes, folders, workflows, docs, or product boundaries
  change
- keep it synchronized with doc churn in `docs/` so the memory index does not point
  to deleted files
