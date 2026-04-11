// Noise/crowding severity level for a study location
export type AnnotationSeverity = 'low' | 'medium' | 'high';

// Marker kind distinguishes group markers from individual study-location markers
export type MarkerKind = 'group' | 'location';

// Qualitative noise band (1 = very quiet … 5 = loud)
export type NoiseBand = 1 | 2 | 3 | 4 | 5;

// One study location returned by GET /api/map-annotations
export type MapLocation = {
  id: string;
  lat: number;
  lng: number;
  title: string;               // fallback display name
  buildingName?: string;       // e.g. "John C. Hitt Library"
  floorLabel?: string;         // e.g. "Floor 4"
  sublocationLabel?: string;   // set when this is a spot inside a building, not the building itself
  summary?: string;            // short description shown in the card
  statusText?: string;         // e.g. "Open until 10pm"
  noiseText?: string;          // e.g. "Quiet" — drives the heat color
  occupancyText?: string;      // e.g. "Moderate"
  updatedAtLabel?: string;     // e.g. "Updated 2 mins ago"
  iconType?: string;           // reserved for future custom icon types
  severity?: AnnotationSeverity;
  color?: string;              // optional override for pin color
  isFavorite?: boolean;
  studyAreaCount?: number;     // e.g. 4 → "4 study areas in this building"
  quietOptionCount?: number;   // e.g. 2 → "2 quiet options"

  // Numeric live readings — present when the backend has a current estimate
  noiseValue?: number | null;    // actual dB level, e.g. 45.2
  occupancyValue?: number | null; // 0–5 scale, e.g. 2.3

  // Marker animation state — driven by explicit API fields, not parsed from text
  kind?: MarkerKind;           // "group" or "location"
  locationGroupId?: string;    // which group this marker belongs to (both kinds carry this)
  noiseBand?: NoiseBand | null; // 1..5 qualitative band, null when noise is unknown
  hasRecentData?: boolean;     // true when updatedAt is within the stale window
  isAnimated?: boolean;        // true when the marker should show animated frames
  updatedAtIso?: string | null; // ISO-8601 timestamp for debugging / future UX
};

// Shape of the API response from GET /api/map-annotations
export type MapAnnotationsResponse = {
  results: MapLocation[];
  error: string;
};