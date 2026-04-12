export const MAP_UI_TUNING = {
  defaultZoom: 15,
  locationZoomThreshold: 17,
  searchDebounceMs: 180,
} as const;

export const ADMIN_UI_TUNING = {
  locationDetailSearchDebounceMs: 300,
  reportPageSize: 50,
} as const;

export const ADMIN_GEOMETRY_TUNING = {
  circlePolygonSegments: 8,
  vertexSnapThresholdDeg: 0.0001,
  boundarySnapThresholdDeg: 0.0005,
  boundaryNodeSpacingMeters: 12,
  defaultMaxRadiusMeters: 60,
} as const;
