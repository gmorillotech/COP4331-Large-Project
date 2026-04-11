// MapHeatOverlay — draws diffuse noise-level blobs directly on the map.
//
// Why imperative code here? google.maps.OverlayView has no React wrapper in
// vis.gl, so we create it manually inside useEffect. Everything else in the
// map folder is declarative JSX — this is the one exception.
//
// useMap()               → gives us the map instance (replaces mapRef.current)
// useMapsLibrary('maps') → gives us OverlayView, LatLng, etc. (replaces window.google.maps)

import { useEffect } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { buildBandColor, buildHeatGradient } from '../../lib/mapUtils.ts';
import type { NoiseBand } from '../../types/mapAnnotations.ts';

// Shape of one pre-computed heat point (computed once from locations)
type HeatPoint = {
  id: string;
  lat: number;
  lng: number;
  color: string;      // rgb() string from buildBandColor
  intensity: number;  // 0–1 derived from noiseBand
  baseRadius: number; // pixel radius before zoom scaling
};

// Convert noiseBand (1–5) to a 0–1 intensity for gradient opacity scaling
function bandToIntensity(band: NoiseBand | null | undefined): number {
  if (band == null) return 0.4;
  return (band - 1) / 4; // 1→0, 2→0.25, 3→0.5, 4→0.75, 5→1
}

// Pre-compute heat point data from raw locations.
function buildHeatPoints(locations: MapLocation[]): HeatPoint[] {
  return locations.map((loc) => {
    const intensity = bandToIntensity(loc.noiseBand);
    const isSub = Boolean(loc.sublocationLabel);
    return {
      id: loc.id,
      lat: loc.lat,
      lng: loc.lng,
      color: buildBandColor(loc.noiseBand),
      intensity,
      // Buildings get larger blobs than individual study spots
      baseRadius: isSub ? 60 + intensity * 40 : 80 + intensity * 50,
    };
  });
}

type MapHeatOverlayProps = {
  locations: MapLocation[];
};

function MapHeatOverlay({ locations }: MapHeatOverlayProps) {
  // useMap() — gets the google.maps.Map instance from React context.
  // This only works because we're rendered inside a <Map> component.
  const map = useMap();

  // useMapsLibrary('maps') — asynchronously loads the 'maps' library from
  // the Google Maps API and returns it. Returns null until loading is done.
  // Gives us OverlayView, LatLng, and other classes.
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    // Wait until both the map instance and the API classes are ready
    if (!map || !mapsLib) return;

    const points = buildHeatPoints(locations);

    // Nothing to draw if there are no locations
    if (points.length === 0) return;

    // ---- Create the OverlayView ----
    // OverlayView is Google's mechanism for placing custom HTML directly on
    // the map canvas (not floating above it in a separate div).
    // It has three lifecycle methods we must implement: onAdd, draw, onRemove.
    const overlay = new mapsLib.OverlayView() as google.maps.OverlayView & {
      points: HeatPoint[];
      container: HTMLDivElement | null;
    };

    // Attach our data to the overlay instance so the lifecycle methods can access it
    overlay.points = points;
    overlay.container = null;

    // onAdd — called once when the overlay is added to the map.
    // Create the container div and insert it into the map's overlayLayer pane.
    // overlayLayer sits between the map tiles and the UI controls.
    overlay.onAdd = function () {
      const div = document.createElement('div');
      div.className = 'map-heatmap-layer';
      this.container = div;
      // getPanes() returns the map's DOM layer hierarchy
      this.getPanes()?.overlayLayer?.appendChild(div);
    };

    // draw — called every time the map moves or zooms.
    // Re-project lat/lng coordinates to pixel positions and redraw all blobs.
    overlay.draw = function () {
      const projection = this.getProjection(); // converts lat/lng ↔ pixel coordinates
      if (!projection || !this.container) return;

      // Scale blob radius gently with zoom.  Using 1.2^x instead of 2^x so
      // blobs grow slower than the map — zooming in reveals individual spots
      // as pixel spacing outpaces blob radius.  Base size calibrated for zoom 15.
      const zoom = map.getZoom() ?? 15;
      const zoomScale = Math.max(Math.pow(1.2, zoom - 15), 0.4);

      // Clear the previous draw pass
      this.container.innerHTML = '';

      for (const point of this.points) {
        const scaledRadius = point.baseRadius * zoomScale;

        // Skip blobs that are too small to see
        if (scaledRadius < 4) continue;

        // fromLatLngToDivPixel — converts a geographic coordinate to a pixel
        // offset within the overlay's coordinate space
        // google.maps.LatLng is available globally via @types/google.maps
        const pixel = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(point.lat, point.lng),
        );
        if (!pixel) continue;

        // Create one div per heat spot — a blurred radial gradient circle
        const spot = document.createElement('div');
        spot.className = 'map-heatmap-layer__spot';
        spot.setAttribute('aria-hidden', 'true'); // invisible to screen readers
        // Center the blob on the lat/lng point
        spot.style.left = `${pixel.x}px`;
        spot.style.top  = `${pixel.y}px`;
        spot.style.width  = `${scaledRadius * 2}px`;
        spot.style.height = `${scaledRadius * 2}px`;
        spot.style.background = buildHeatGradient(point.color, point.intensity);
        this.container.appendChild(spot);
      }
    };

    // onRemove — called when the overlay is removed from the map.
    // Clean up the DOM node we created in onAdd.
    overlay.onRemove = function () {
      this.container?.parentNode?.removeChild(this.container);
      this.container = null;
    };

    // Attach the overlay to the map — triggers onAdd, then draw
    overlay.setMap(map);

    // Cleanup: when locations change or the component unmounts, remove the overlay
    return () => {
      overlay.setMap(null); // triggers onRemove
    };
  }, [map, mapsLib, locations]); // re-run whenever the map, API, or location data changes

  // This component renders nothing to the React tree — all output is in the map canvas
  return null;
}

export default MapHeatOverlay;