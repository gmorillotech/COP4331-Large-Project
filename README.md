# COP4331 Large Project — Decibel Tracker

A full-stack app for tracking noise levels and occupancy across UCF campus study spaces.

## Team

- Brian Huang
- George Morillo
- Ava Sanford
- Vaishal Devasenapathy
- Aidan Alich
- Bhagyesh Jethwani

## Tech Stack

- **Backend**: Express 5, Node.js, MongoDB, JWT
- **Web Frontend**: React 19, Vite, TypeScript
- **Mobile**: Flutter 3.11+, Dart
- **Maps**: Google Maps (web and mobile)

## Local Development

### Backend

```bash
cd server
npm install
npm run dev
```

Runs on port **5050**. Requires an SSH tunnel for MongoDB access (see team docs).

### Web Frontend

```bash
cd Web_Frontend
npm install
npm run dev
```

Runs on port **5173**. API requests are proxied to the backend via Vite config.

### Flutter App

```bash
cd flutter_application_1
flutter pub get
flutter run
```

## Setup Details

Credentials, SSH access, MongoDB URIs, and deployment info are maintained in the team's shared documentation and are not duplicated here.
