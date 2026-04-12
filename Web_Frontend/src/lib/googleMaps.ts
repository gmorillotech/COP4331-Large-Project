import { MAP_UI_TUNING } from '../config/uiTuning.ts';

// Default map center — UCF main campus
export const DEFAULT_CENTER = { lat: 28.6003, lng: -81.2012 } as const;

// Default zoom level when the map first loads
export const DEFAULT_ZOOM = MAP_UI_TUNING.defaultZoom;

// Map ID from Google Cloud Console → Maps Platform → Map Management
// Stored in .env as VITE_GOOGLE_MAPS_MAP_ID so it stays out of source control.
// Required for AdvancedMarker (custom HTML pins).
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '';