# COP4331 Large Project

## Team Members
- Brian Huang
- George Morillo
- Ava Sanford
- Vaishal Devasenapathy
- Aidan Alich
- Bhagyesh Jethwani

## Setup
Backend:
- cd server
- npm install
- npm run dev

Frontend:
- cd client
- npm install
- npm run dev

Alternate Frontend:
- cd Frontend
- npm install
- set `VITE_GOOGLE_MAPS_API_KEY=your_browser_key`
- npm run dev

## Tech Stack
Frontend: React + vite, Typescript
Backend: Express, Node
Database: MongoDB

## Project Description
A MERN-stack decibel tracker app and web app hosted on a DigitalOcean droplet.



## Setup Instructions
TBA

## Map Overlay Notes
- `GET /api/map-annotations` returns the shared annotation payload used by the web map overlay.
- The `Frontend` app renders custom pins and app-owned text popups on top of Google Maps.
