# Persistent Project Memory Index

Last updated: 2026-04-10

This file is an explicit, human-readable stand-in for the kind of "project memory"
people often assume a coding agent keeps automatically. It captures the repository's
identity, layout, major systems, important docs, and the local quirks that matter
when returning to the project later.

## Project Identity

- Repository name: `COP4331-Large-Project`
- Product name in docs: `Decibel Tracker`
- Alternate product name in admin docs: `SpotStudy`
- Domain: UCF campus study-space discovery and reporting
- Core idea: track study locations, noise levels, occupancy, favorites, and admin
  operations across web, mobile, and backend surfaces

## Tech Stack

- Backend: Node.js + Express 5 + MongoDB/Mongoose + JWT
- Web frontend: React 19 + Vite + TypeScript
- Mobile app: Flutter + Dart
- Maps:
  - web: `@vis.gl/react-google-maps`
  - mobile: `google_maps_flutter`
- Supporting mobile libraries: `geolocator`, `noise_meter`, `permission_handler`,
  `provider`, `shared_preferences`, `url_launcher`

## Top-Level Repository Layout

- `README.md`: high-level project overview and local dev commands
- `server/`: Express API, Mongo models, route wiring, backend services
- `Web_Frontend/`: React/Vite website, including admin UI
- `flutter_application_1/`: Flutter app for login, map exploration, data collection,
  and account-center work
- `shared/`: shared TypeScript artifacts related to the A1 service layout/support
  services
- `unit_tests/`: TypeScript-based A1 test harness and calibration tooling
- `docs/`: project-specific specs, checklists, and ops notes
- `design_mockups/`: SVG mockups for the data-collection experience
- `.github/`: CI/deployment workflow(s)
- `.claude/`: local agent/tooling folder, including mirrored worktree content
- `.obsidian/`: local Obsidian vault settings
- `Algorithm-A1.drawio.pdf`: architecture/design diagram artifact

## What Each Major Application Does

### `server/`

Purpose:
- serves the API used by the website and Flutter app
- handles auth, locations, reports, admin operations, and map annotation data

Observed entrypoint:
- `server/server.js`

Key behavior:
- starts Express with CORS and JSON handling
- mounts auth, location, study-location, report, and admin route groups
- exposes `GET /api/health`
- exposes `GET /api/map-annotations`
- attempts MongoDB connection before starting
- falls back into a degraded local mode if MongoDB is unavailable outside production
- starts a polling loop for A1 report processing when DB connectivity is available

Main backend route groups:
- `routes/authRoutes.js`
- `routes/locationRoutes.js`
- `routes/reportRoutes.js`
- `routes/studyLocationRoutes.js`
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
- `services/locationCatalog.js`
- `services/mapSearchData.js`
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
- `config/runtimeConfig.js`: canonical server operational config (noise thresholds, report limits, auth TTL, location defaults)
- `middleware/authMiddleware.js`: auth protection
- `createJWT.js`: JWT support
- `seed.js`: seed/setup script
- `repositories/`: location and query helper abstraction layer

### `Web_Frontend/`

Purpose:
- web application for login, home/map exploration, data collection, and admin tools

Observed entrypoint:
- `Web_Frontend/src/App.tsx`

Observed route structure:
- `/`: login page
- `/home`: main home page
- `/collect`: data collection page
- `/admin`: admin area behind `AdminGuard`
- `/admin/users`: user management
- `/admin/redraw/:groupId`: group redraw flow
- `/admin/split/:groupId`: group split flow
- `/admin/locations`: admin location editing

Main frontend folders:
- `src/pages/`: top-level page routes
- `src/components/`: reusable UI pieces
- `src/components/admin/`: admin-specific UI
- `src/components/map/`: map rendering and overlays
- `src/lib/`: map/admin geometry helpers and Google Maps support
- `src/config/`: local/live/active frontend config targets
- `src/types/`: shared frontend types
- `src/utils/`: helpers such as email masking
- `src/assets/`: image assets

Important observed frontend themes:
- map-first experience
- separate admin shell and admin guard
- favorites support
- Google Maps based visualization
- dedicated data collection flow

### `flutter_application_1/`

Purpose:
- mobile/desktop Flutter client for login, study-space map search, favorites,
  data collection, and account-center work

Observed entrypoint:
- `flutter_application_1/lib/main.dart`

Main Flutter feature areas:
- `lib/auth/`: auth service, models, login page
- `lib/map_search/`: map search viewport and map experience
- `lib/data_collection/`: collection workflow, render model, backend integration,
  background controller
- `lib/account_center/`: account-center page, backend calls, models
- `lib/config/`: API configuration

Observed app behavior:
- persists auth state using `SharedPreferences`
- routes authenticated users into the map experience
- includes seeded/fallback map records in code
- supports compile-time API base URL overrides
- documents local fallback queue behavior for data collection when backend is down

### `shared/`

Purpose:
- shared TypeScript files used by the A1/unit-test toolchain

Observed contents:
- `src/uml_service_layout.ts`
- `src/uml_service_layout.js`
- `src/support_services.js`

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

### Primary docs in `docs/`

- `docs/admin-mode-spec.md`
  - draft specification for a separate admin experience
  - covers admin search, report deletion, group merge/redraw, and user management
- `docs/admin-mode-checklist.md`
  - implementation/status checklist for the admin surface
- `docs/app-auth-parity-checklist.md`
  - checklist comparing website/backend auth flows to the Flutter app
- `docs/app-dynamic-icons-port-plan.md`
  - implementation plan for porting web dynamic map-marker icons into the Flutter app
- `docs/https-rollback-droplet.md`
  - deployment/ops note related to HTTPS rollback on a droplet
- `docs/force-server-update.txt`
  - currently empty

### Supporting design/material docs

- `design_mockups/README.md`
  - explains the SVG mockups for the manual occupancy + microphone capture screen
- `Algorithm-A1.drawio.pdf`
  - architecture/design artifact for A1-related work

## Testing Surface

### Backend integration tests

Observed in `server/tests/`:
- `reportRoutes.integration.test.js`
- `reportProcessing.integration.test.js`
- `locationRoutes.integration.test.js`
- `adminSearchRoutes.integration.test.js`

### Flutter tests

Observed in `flutter_application_1/test/`:
- auth/account tests
- map-search tests
- data-collection model/render/workflow tests

Examples:
- `login_page_test.dart`
- `account_center_page_test.dart`
- `map_search_viewport_test.dart`
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

## Known Architectural Themes

- one backend serves both the web app and Flutter app
- the website and mobile app are not fully identical; parity work is tracked
  explicitly in docs
- admin functionality is web-first and documented as a separate experience
- map-based search and map annotations are a central product concept
- live report processing and polling are part of the backend design
- data collection exists as both a web-facing page and a richer Flutter workflow

## Repo-Specific Quirks Worth Remembering

- `.claude/worktrees/agent-*` contains a mirrored worktree created by tooling; it
  is not the canonical source of truth for edits
- `.obsidian/` is editor/vault configuration, not application logic
- `unit_tests/node_modules/` and `unit_tests/dist/` exist inside the repo tree
  locally and can add noise when doing broad file scans
- there is a production deployment workflow at `.github/workflows/production-deploy.yml`
- credentials, SSH details, MongoDB URIs, and deployment secrets are intentionally
  not duplicated in the repository README

## What Is Not Stored Here

This index intentionally does not try to store:
- secrets or credentials
- unverified assumptions about database schema beyond observed model files/docs
- transient local state from dev servers
- full copies of generated/vendor files

## Recommended Use

Treat this file as the first-stop project memory for future work:
- read it before exploring the repo from scratch
- update it when major routes, folders, workflows, or product boundaries change
- keep it synchronized with new docs/checklists when a feature area expands
