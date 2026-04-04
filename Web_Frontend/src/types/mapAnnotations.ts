// Noise/crowding severity level for a study location
export type AnnotationSeverity = 'low' | 'medium' | 'high';

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
};

// Shape of the API response from GET /api/map-annotations
export type MapAnnotationsResponse = {
  results: MapLocation[];
  error: string;
};