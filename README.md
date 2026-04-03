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

## Mongo Setup
There are two different Mongo connection cases. Use the one that matches where your Node server is running.

### 1. Running the Node server on the droplet
If you SSH into the droplet and start the backend there, use this in the droplet's backend `.env`:

```env
PORT=5050
MONGO_URI=mongodb://appUser:Appuser!@127.0.0.1:27017/cop4331_large_project?authSource=cop4331_large_project
FRONTEND_URL=http://localhost:5173
```

Why:
- `127.0.0.1:27017` means "MongoDB running on the same droplet"
- this URI is only correct when the Node server is also running on that droplet

### 2. Running the Node server on your own machine
If you run `cd server` and `npm run dev` on your laptop or desktop, do not use the droplet-local `27017` URI directly.

First create an SSH tunnel from your machine to the droplet:

```bash
ssh -L 27018:127.0.0.1:27017 root@167.71.81.89
```

Then use this in your local `server/.env`:

```env
MONGO_URI=mongodb://appUser:Appuser!@127.0.0.1:27018/cop4331_large_project?authSource=cop4331_large_project
ACCESS_TOKEN_SECRET=local-dev-secret
```

Why:
- `27017` is the MongoDB port on the droplet
- `27018` is the forwarded port on your local machine
- your local Node server connects to `127.0.0.1:27018`, and SSH forwards that traffic to MongoDB on the droplet

### Quick rule
- Node server running on droplet: use `127.0.0.1:27017`
- Node server running on your machine: use `127.0.0.1:27018` and keep the SSH tunnel open

### Testing the tunnel locally
To confirm the tunnel works from your own machine:

```bash
mongosh "mongodb://appUser:Appuser!@127.0.0.1:27018/cop4331_large_project?authSource=cop4331_large_project"
```

### If you see "degraded local mode"
That means the Express server started, but MongoDB connection failed.

Common reasons:
- the SSH tunnel is not running
- the local `.env` is using the wrong Mongo URI
- MongoDB on the droplet is down
- the username, password, or `authSource` is wrong

## Map Overlay Notes
- `GET /api/map-annotations` returns the shared annotation payload used by the web map overlay.
- The `Frontend` app renders custom pins and app-owned text popups on top of Google Maps.
