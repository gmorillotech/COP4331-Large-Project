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
  // High-segment-count circles used only for visual preview overlays.
  previewCirclePolygonSegments: 24,
  // Low-segment-count circles used as working polygons during
  // redraw/split geometry computation. Kept low so subtract/split
  // operations stay tractable.
  workingCirclePolygonSegments: 6,
  vertexSnapThresholdDeg: 0.0001,
  boundarySnapThresholdDeg: 0.0005,
  boundaryNodeSpacingMeters: 12,
  defaultMaxRadiusMeters: 60,
} as const;
