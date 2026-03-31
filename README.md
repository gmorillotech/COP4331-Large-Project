# COP4331 Large Project

## Team Members
- Brian Huang
- George Morillo
- Ava Sanford
- Vaishal Devasenapathy
- Aidan Alich
- Bhagyesh Jethwani

## Local Setup
Backend:
- `cd server`
- `npm install`
- `npm run dev`

React frontend:
- `cd client`
- `npm install`
- `npm run dev`

Flutter app:
- `cd flutter_application_1`
- `flutter pub get`
- `flutter run`
- The Flutter app now defaults to the backend on `http://localhost:5050`
- Android emulator default: `http://10.0.2.2:5050`

Alternate web frontend:
- `cd Web_Frontend`
- `npm install`
- set `VITE_GOOGLE_MAPS_API_KEY=your_browser_key`
- `npm run dev`

## Tech Stack
Frontend: React + vite, Typescript
Backend: Express, Node
Database: MongoDB

## Project Description
A MERN-stack decibel tracker app and web app hosted on a DigitalOcean droplet.



## Backend Defaults
- Express backend port: `5050`
- Flutter data-collection screen posts reports to `/api/reports`
- Flutter map screen reads map data from `/api/map-annotations`

## A1 Module Layout
- Canonical A1/session service source now lives in `shared/src`
- Compiled runtime artifacts for the Node backend are emitted to `shared/dist`
- The Express backend consumes `shared/dist/uml_service_layout.js`
- The TypeScript unit tests import directly from `shared/src`
- Rebuild shared A1 code and tests from `unit_tests` with `npm run build`

## Droplet Deployment
Backend app folder:
- `/var/www/cardsServer`

Frontend folder:
- `/var/www/html`

PM2 process:
- `cards-server`

Backend port:
- `5050`

Backend environment file:
```env
PORT=5050
MONGO_URI=mongodb://appUser:Appuser!@167.71.81.89:27017/cop4331_large_project?authSource=cop4331_large_project
FRONTEND_URL=http://localhost:5173
```

## Mongo Access
Use this when connecting from the droplet itself:

```env
MONGO_URI=mongodb://appUser:Appuser!@127.0.0.1:27017/cop4331_large_project?authSource=cop4331_large_project
```

If the SSH tunnel dies, recreate it with:

```bash
ssh -L 27018:127.0.0.1:27017 root@167.71.81.89
```

Connection notes:
- Host on local machine through tunnel: `127.0.0.1`
- Local forwarded port: `27018`
- Mongo port on droplet: `27017`
- `authSource`: `cop4331_large_project`

Local `mongosh` through the tunnel:

```bash
mongosh "mongodb://appUser:Appuser!@127.0.0.1:27018/cop4331_large_project?authSource=cop4331_large_project"
```

## Map Overlay Notes
- `GET /api/map-annotations` returns the shared annotation payload used by the web map overlay.
- The `Frontend` app renders custom pins and app-owned text popups on top of Google Maps.
