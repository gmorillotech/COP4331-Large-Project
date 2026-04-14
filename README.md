# COP4331 Large Project - Decibel Tracker / StudySpot

This repository contains the Decibel Tracker / StudySpot system: a shared backend,
a React web app, a Flutter mobile app, and supporting A1 calibration tooling for
UCF study-space discovery, live reporting, favorites, profile management, and
admin workflows.

This is the single maintained README for the repository. Folder-level README files
have been removed so setup and project context live in one place.

## Team

- Brian Huang
- George Morillo
- Ava Sanford
- Vaishal Devasenapathy
- Aidan Alich
- Bhagyesh Jethwani

## What The Project Includes

- authenticated user accounts with profile, favorites, password, and account
  deletion flows
- map-based search for buildings and study spots
- live report submission for noise and occupancy
- Flutter and web clients backed by the same API
- admin search, geometry, location, and user-management tools
- A1 calibration and unit-test tooling in `unit_tests/`

## Tech Stack

- Backend: Node.js, Express 5, MongoDB, Mongoose, JWT
- Web frontend: React 19, Vite, TypeScript
- Mobile app: Flutter 3.11+, Dart
- Maps:
  - web: `@vis.gl/react-google-maps`
  - mobile: `google_maps_flutter`

## Repository Layout

- `server/`: Express API, models, routes, services, and integration tests
- `Web_Frontend/`: React/Vite website, including admin tools
- `flutter_application_1/`: Flutter app for auth, map search, data collection,
  favorites, and account-center flows
- `shared/`: shared TypeScript artifacts used by the A1 tooling
- `unit_tests/`: A1 build, test, and calibration harness
- `docs/`: project memory and implementation notes
- `design_mockups/`: SVG mockups for the data-collection screen

## Prerequisites

- Node.js and npm
- Flutter SDK
- MongoDB access through the team's SSH/database setup
- Google Maps credentials for the surfaces you want to run

Secrets, SSH details, database URIs, SendGrid credentials, and deployment
configuration are intentionally not duplicated in this repository.

## Local Development

### 1. Backend

Install and run the API:

```bash
cd server
npm install
npm run dev
```

Useful scripts:

```bash
npm start
npm run test:integration
```

Notes:

- default local port: `5050`
- MongoDB access depends on the team's external tunnel/configuration
- the server exposes `GET /api/health` for a quick sanity check

### 2. Web Frontend

Install and run the React app:

```bash
cd Web_Frontend
npm install
npm run dev
```

Useful scripts:

```bash
npm run build
npm run lint
npm run preview
```

Notes:

- default Vite dev port: `5173`
- API requests are proxied through the frontend config/Vite setup

### 3. Flutter App

Install packages and run the app:

```bash
cd flutter_application_1
flutter pub get
flutter run
```

Default API targets:

- Android emulator: `http://10.0.2.2:5050`
- desktop/mobile local runs: `http://localhost:5050`

Supported `--dart-define` overrides:

- `MAP_API_BASE_URL=http://your-host:5050`
- `DATA_COLLECTION_API_BASE_URL=http://your-host:5050`
- `DATA_COLLECTION_AUTH_TOKEN=your_token`
- `DATA_COLLECTION_USER_ID=your_user_id`
- `ACCOUNT_CENTER_AUTH_TOKEN=your_token`

Android Google Maps setup:

1. Enable Maps SDK for Android in your Google Cloud project.
2. Add your Android key to `flutter_application_1/android/local.properties`:

```properties
GOOGLE_MAPS_API_KEY=your_android_maps_key
```

Notes:

- the Flutter app persists auth locally with `SharedPreferences`
- the data-collection flow can fall back to a local in-memory queue if the
  backend is unavailable

### 4. A1 Unit Tests And Calibration

Install dependencies and run the TypeScript harness:

```bash
cd unit_tests
npm install
npm test
```

Other useful scripts:

```bash
npm run build
npm run calibrate
npm run calibrate -- .\calibration\tuning_profile.example.json
```

Calibration focus areas:

- step-response speed after sudden noise changes
- outlier damping behavior
- trust drift under repeated biased reports
- report decay timing for locations and groups
- location-group freshness weighting

Useful override knobs in the tuning profile:

- `reportHalfLifeMs`
- `varianceSoftCap`
- `peerToleranceDb`
- `historicalToleranceDb`
- `minSessionCorrectionWF`
- `componentWeights`
- `occupancyOverreportRate`
- `occupancyUnderreportRate`
- `noiseOverreportRate`
- `noiseUnderreportRate`
- `trustDeadband`
- `trustExponent`

## Important Product Surfaces

### Backend

- auth, profile, password reset, and self-service account deletion
- location search, closest-location lookup, and study-location listing
- report submission and history
- admin search, geometry editing, location editing, and user management
- map annotations feed

### Web

- login and account flows
- main map exploration experience
- profile panel and favorites
- web data-collection workflow
- admin pages for reports, geometry, locations, and users

### Flutter

- login and persisted session handling
- map-first search experience with favorites
- search/filter sheet and result browsing
- data-collection workflow
- account center with profile save, password change, logout, and account deletion

## Documentation And Reference Material

- `docs/project-memory-index.md`: current repository memory and architecture notes
- `docs/port-feasibility-report.md`: map-icon and mic-port feasibility analysis
- `docs/app-account-deletion-port-plan.md`: account deletion port record
- `docs/map-search-bug-findings-2026-04-14.md`: map-search investigation notes
- `design_mockups/`:
  - `data-collection-screen-mockup.svg`
  - `element-decibel-readout.svg`
  - `element-noise-bar.svg`
  - `element-occupancy-control.svg`
  - `element-mic-wave-system.svg`

## Notes For Contributors

- `docs/project-memory-index.md` is the fastest way to regain context after time
  away from the repo
- `.claude/worktrees/agent-*` contains mirrored worktrees created by tooling and
  should not be treated as the canonical source of truth
- `unit_tests/node_modules/`, `unit_tests/dist/`, and other dependency/build
  folders add noise during broad file searches
- some deployment and infrastructure behavior lives outside the repo in team docs
