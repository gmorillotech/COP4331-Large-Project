import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMapsApi } from '../lib/googleMaps.ts';
import type {
  AnnotationSeverity,
  MapLocation,
  MapAnnotationsResponse,
} from '../types/mapAnnotations.ts';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_CENTER = { lat: 28.6003, lng: -81.2012 };
const SEVERITY_OPTIONS: Array<AnnotationSeverity | 'all'> = [
  'all',
  'high',
  'medium',
  'low',
];

type MarkerWithMetadata = {
  marker: any;
  cleanup: () => void;
};

type HeatPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  intensity: number;
  color: string;
  radius: number;
  markerVariant: 'pin' | 'mini-pin';
};

type PreviewPoint = HeatPoint & {
  left: string;
  top: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function severityLabel(severity: AnnotationSeverity | undefined): string {
  if (!severity) {
    return 'Unrated';
  }

  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function inferMarkerVariant(location: MapLocation): 'pin' | 'mini-pin' {
  return location.sublocationLabel ? 'mini-pin' : 'pin';
}

function inferNoiseValue(location: MapLocation): number {
  const normalizedText = location.noiseText?.toLowerCase() ?? '';

  if (normalizedText.includes('very quiet')) return 0.1;
  if (normalizedText.includes('quiet')) return 0.22;
  if (normalizedText.includes('moderate')) return 0.52;
  if (normalizedText.includes('busy')) return 0.74;
  if (normalizedText.includes('loud')) return 0.9;

  switch (location.severity) {
    case 'low':
      return 0.24;
    case 'medium':
      return 0.56;
    case 'high':
      return 0.88;
    default:
      return 0.42;
  }
}

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function hexToRgb(hexColor: string): [number, number, number] {
  const normalized = hexColor.replace('#', '');
  const segments =
    normalized.length === 3
      ? normalized.split('').map((segment) => segment + segment)
      : normalized.match(/.{1,2}/g) ?? ['00', '00', '00'];

  return segments.slice(0, 3).map((segment) => Number.parseInt(segment, 16)) as [
    number,
    number,
    number,
  ];
}

function mixHexColors(startHex: string, endHex: string, ratio: number): string {
  const [startR, startG, startB] = hexToRgb(startHex);
  const [endR, endG, endB] = hexToRgb(endHex);
  const safeRatio = clamp(ratio, 0, 1);

  const r = interpolateChannel(startR, endR, safeRatio);
  const g = interpolateChannel(startG, endG, safeRatio);
  const b = interpolateChannel(startB, endB, safeRatio);

  return `rgb(${r}, ${g}, ${b})`;
}

function buildHeatColor(intensity: number): string {
  if (intensity <= 0.33) {
    return mixHexColors('#2563eb', '#06b6d4', intensity / 0.33);
  }

  if (intensity <= 0.66) {
    return mixHexColors('#06b6d4', '#facc15', (intensity - 0.33) / 0.33);
  }

  return mixHexColors('#f97316', '#dc2626', (intensity - 0.66) / 0.34);
}

function heatGradient(color: string, intensity: number): string {
  const coreOpacity = 0.18 + intensity * 0.28;
  const midOpacity = 0.12 + intensity * 0.14;
  const edgeOpacity = 0.03 + intensity * 0.08;

  return `radial-gradient(circle, ${color.replace('rgb', 'rgba').replace(')', `, ${coreOpacity})`)} 0%, ${color.replace('rgb', 'rgba').replace(')', `, ${midOpacity})`)} 34%, ${color.replace('rgb', 'rgba').replace(')', `, ${edgeOpacity})`)} 58%, rgba(0, 0, 0, 0) 76%)`;
}

function buildMarkerTone(location: MapLocation, intensity: number): string {
  if (location.color) {
    return location.color;
  }

  return buildHeatColor(intensity);
}

function createMarkerIcon(location: MapLocation, isSelected: boolean): string {
  const intensity = inferNoiseValue(location);
  const pinColor = buildMarkerTone(location, intensity);
  const badgeColor = buildHeatColor(intensity);
  const markerVariant = inferMarkerVariant(location);
  const stroke = isSelected ? '#081220' : '#ffffff';
  const badgeStroke = isSelected ? '#ffffff' : '#081220';
  const markerLabel = severityLabel(location.severity).slice(0, 1).toUpperCase();
  const translateX = isSelected ? -3 : 0;
  const translateY = isSelected ? -3 : 0;
  const scale = isSelected ? 1.08 : 1;

  const pinShape =
    markerVariant === 'mini-pin'
      ? `<path d="M32 26c0 10.8-11.7 21.9-13.5 23.6a1.6 1.6 0 0 1-2.2 0C14.6 47.9 3 36.8 3 26 3 17.2 10.2 10 19 10s16 7.2 16 16Z" fill="${pinColor}" stroke="${stroke}" stroke-width="3"/><circle cx="19" cy="26" r="7.5" fill="rgba(255,255,255,0.94)"/>`
      : `<path d="M29 6C16.4 6 6.2 16 6.2 28.4c0 16.5 18.5 33.8 21.2 36.3a2.2 2.2 0 0 0 3 0c2.8-2.5 21.4-19.8 21.4-36.3C51.8 16 41.6 6 29 6Z" fill="${pinColor}" stroke="${stroke}" stroke-width="4"/><circle cx="29" cy="28.4" r="11.5" fill="rgba(255,255,255,0.94)"/>`;

  const pinLabel =
    markerVariant === 'mini-pin'
      ? `<text x="19" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5" font-weight="700" fill="#081220">${markerLabel}</text>`
      : `<text x="29" y="32" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#081220">${markerLabel}</text>`;

  const badge = `
    <g transform="translate(${markerVariant === 'mini-pin' ? 24 : 32} ${markerVariant === 'mini-pin' ? 4 : 2})">
      <circle cx="12" cy="12" r="${markerVariant === 'mini-pin' ? 10 : 11}" fill="#081220" opacity="0.92" />
      <circle cx="12" cy="12" r="${markerVariant === 'mini-pin' ? 6.6 : 7}" fill="${badgeColor}" stroke="${badgeStroke}" stroke-width="1.4" />
      <path d="M9 13.5V10.5h2.2l2.6-2.2v7.4l-2.6-2.2H9Z" fill="#081220"/>
      <path d="M15 10.1c1.1.6 1.8 1.7 1.8 2.9 0 1.2-.7 2.3-1.8 2.9" fill="none" stroke="#081220" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M16.8 8.1c1.7 1 2.8 2.8 2.8 4.9s-1.1 3.9-2.8 4.9" fill="none" stroke="#081220" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
    </g>
  `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="76" viewBox="0 0 64 76">
      <g transform="translate(${translateX} ${translateY}) scale(${scale})">
        ${pinShape}
        ${pinLabel}
        ${badge}
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatLocationHeading(location: MapLocation): string {
  return [location.buildingName, location.floorLabel].filter(Boolean).join(' - ') || location.title;
}

function buildSearchableText(location: MapLocation): string {
  return [
    location.title,
    location.buildingName,
    location.floorLabel,
    location.sublocationLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildHeatPoints(locations: MapLocation[]): HeatPoint[] {
  return locations.map((location) => {
    const intensity = inferNoiseValue(location);
    const markerVariant = inferMarkerVariant(location);

    return {
      id: location.id,
      lat: location.lat,
      lng: location.lng,
      label: formatLocationHeading(location),
      intensity,
      color: buildHeatColor(intensity),
      radius: markerVariant === 'mini-pin' ? 90 + intensity * 90 : 120 + intensity * 110,
      markerVariant,
    };
  });
}

function buildPreviewPoints(locations: MapLocation[]): PreviewPoint[] {
  if (locations.length === 0) {
    return [];
  }

  const lats = locations.map((location) => location.lat);
  const lngs = locations.map((location) => location.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.0008);
  const lngSpan = Math.max(maxLng - minLng, 0.0008);

  return buildHeatPoints(locations).map((point) => {
    const normalizedX = (point.lng - minLng) / lngSpan;
    const normalizedY = (maxLat - point.lat) / latSpan;

    return {
      ...point,
      left: `${12 + normalizedX * 76}%`,
      top: `${12 + normalizedY * 72}%`,
    };
  });
}

function createHeatOverlay(googleMaps: any, map: any, points: HeatPoint[]): any {
  const overlay = new googleMaps.maps.OverlayView();
  overlay.points = points;
  overlay.container = null;

  overlay.onAdd = function onAdd() {
    const container = document.createElement('div');
    container.className = 'map-heatmap-layer';
    this.container = container;
    this.getPanes()?.overlayLayer?.appendChild(container);
  };

  overlay.draw = function draw() {
    const projection = this.getProjection();
    const container = this.container as HTMLDivElement | null;

    if (!projection || !container) {
      return;
    }

    container.innerHTML = '';

    for (const point of this.points as HeatPoint[]) {
      const pixel = projection.fromLatLngToDivPixel(
        new googleMaps.maps.LatLng(point.lat, point.lng),
      );

      if (!pixel) {
        continue;
      }

      const spot = document.createElement('div');
      spot.className = 'map-heatmap-layer__spot';
      spot.setAttribute('aria-hidden', 'true');
      spot.style.left = `${pixel.x}px`;
      spot.style.top = `${pixel.y}px`;
      spot.style.width = `${point.radius * 2}px`;
      spot.style.height = `${point.radius * 2}px`;
      spot.style.background = heatGradient(point.color, point.intensity);

      container.appendChild(spot);
    }
  };

  overlay.onRemove = function onRemove() {
    const container = this.container as HTMLDivElement | null;

    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }

    this.container = null;
  };

  overlay.setMap(map);
  return overlay;
}

function MapExplorer() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<MarkerWithMetadata[]>([]);
  const heatOverlayRef = useRef<any | null>(null);
  const hasFittedBoundsRef = useRef(false);

  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<AnnotationSeverity | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading sound map...');
  const [mapReady, setMapReady] = useState(false);
  const [isUsingMapFallback, setIsUsingMapFallback] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function fetchAnnotations(): Promise<void> {
      try {
        const response = await fetch('http://localhost:5050/api/map-annotations');
        const payload: MapAnnotationsResponse = await response.json();

        if (!isActive) {
          return;
        }

        if (payload.error) {
          setLocations([]);
          setStatusMessage(payload.error);
          return;
        }

        setLocations(payload.results);
        setSelectedId(payload.results[0]?.id ?? null);
        setStatusMessage(
          payload.results.length > 0
            ? `${payload.results.length} searchable map locations loaded`
            : 'No map locations available',
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const fallback =
          error instanceof Error ? error.message : 'Unable to load map annotations';
        setLocations([]);
        setStatusMessage(fallback);
      }
    }

    void fetchAnnotations();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const searchFilteredLocations = useMemo(() => {
    if (!debouncedSearch) {
      return locations;
    }

    return locations.filter((location) => buildSearchableText(location).includes(debouncedSearch));
  }, [debouncedSearch, locations]);

  const filteredLocations = useMemo(() => {
    if (severityFilter === 'all') {
      return searchFilteredLocations;
    }

    return searchFilteredLocations.filter((location) => location.severity === severityFilter);
  }, [searchFilteredLocations, severityFilter]);

  const selectedLocation = useMemo(() => {
    const source = filteredLocations.length > 0 ? filteredLocations : locations;
    return source.find((location) => location.id === selectedId) ?? source[0] ?? null;
  }, [filteredLocations, locations, selectedId]);

  const heatPoints = useMemo(() => buildHeatPoints(filteredLocations), [filteredLocations]);
  const fallbackPreviewPoints = useMemo(
    () => buildPreviewPoints(filteredLocations.length > 0 ? filteredLocations : locations),
    [filteredLocations, locations],
  );

  useEffect(() => {
    if (!selectedLocation && filteredLocations.length > 0) {
      setSelectedId(filteredLocations[0].id);
    }
  }, [filteredLocations, selectedLocation]);

  useEffect(() => {
    let isDisposed = false;

    async function initializeMap(): Promise<void> {
      if (!mapContainerRef.current) {
        return;
      }

      if (!GOOGLE_MAPS_API_KEY) {
        setIsUsingMapFallback(true);
        setStatusMessage('Add VITE_GOOGLE_MAPS_API_KEY to render the live Google map.');
        return;
      }

      try {
        const googleMaps = await loadGoogleMapsApi(GOOGLE_MAPS_API_KEY);

        if (isDisposed || !mapContainerRef.current) {
          return;
        }

        mapRef.current = new googleMaps.maps.Map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });

        mapRef.current.addListener('click', () => {
          setSelectedId(null);
        });

        setMapReady(true);
        setIsUsingMapFallback(false);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        const fallback =
          error instanceof Error ? error.message : 'Unable to initialize Google Maps';
        setStatusMessage(fallback);
        setIsUsingMapFallback(true);
      }
    }

    void initializeMap();

    return () => {
      isDisposed = true;

      if (heatOverlayRef.current) {
        heatOverlayRef.current.setMap(null);
        heatOverlayRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    const googleMaps = map.getDiv().ownerDocument.defaultView?.google;

    if (!googleMaps) {
      return;
    }

    if (heatOverlayRef.current) {
      heatOverlayRef.current.setMap(null);
      heatOverlayRef.current = null;
    }

    if (heatPoints.length > 0) {
      heatOverlayRef.current = createHeatOverlay(googleMaps, map, heatPoints);
    }

    return () => {
      if (heatOverlayRef.current) {
        heatOverlayRef.current.setMap(null);
        heatOverlayRef.current = null;
      }
    };
  }, [heatPoints, mapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    for (const entry of markersRef.current) {
      entry.cleanup();
      entry.marker.setMap(null);
    }
    markersRef.current = [];

    const activeLocations = filteredLocations.map((location) => ({
      ...location,
      isSelected: location.id === selectedId,
    }));

    if (activeLocations.length === 0) {
      return;
    }

    const googleMaps = map.getDiv().ownerDocument.defaultView?.google;

    if (!googleMaps) {
      return;
    }

    const bounds = new googleMaps.maps.LatLngBounds();

    for (const location of activeLocations) {
      const markerVariant = inferMarkerVariant(location);
      const marker = new googleMaps.maps.Marker({
        map,
        position: { lat: location.lat, lng: location.lng },
        title: formatLocationHeading(location),
        icon: {
          url: createMarkerIcon(location, Boolean(location.isSelected)),
          scaledSize:
            markerVariant === 'mini-pin'
              ? new googleMaps.maps.Size(location.isSelected ? 48 : 42, location.isSelected ? 58 : 52)
              : new googleMaps.maps.Size(location.isSelected ? 64 : 58, location.isSelected ? 76 : 70),
        },
        zIndex: location.id === selectedId ? 100 : 10,
      });

      const listener = marker.addListener('click', () => {
        setSelectedId(location.id);
      });

      bounds.extend(marker.getPosition());
      markersRef.current.push({
        marker,
        cleanup: () => listener.remove(),
      });
    }

    if (!hasFittedBoundsRef.current) {
      map.fitBounds(bounds, 72);
      hasFittedBoundsRef.current = true;
    }
  }, [filteredLocations, mapReady, selectedId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !selectedLocation) {
      return;
    }

    const googleMaps = map.getDiv().ownerDocument.defaultView?.google;

    if (!googleMaps) {
      return;
    }

    const destination = new googleMaps.maps.LatLng(selectedLocation.lat, selectedLocation.lng);
    map.panTo(destination);

    if (map.getZoom() < 17) {
      map.setZoom(17);
    }
  }, [mapReady, selectedLocation]);

  const popupLocation = selectedLocation;
  const isSearching = debouncedSearch.length > 0;
  const emptyStateMessage = isSearching
    ? 'No locations match your search and filter combination.'
    : 'No annotations match this filter.';

  return (
    <section className="map-shell" aria-labelledby="sound-map-title">
      <div className="map-shell__header">
        <div>
          <p className="eyebrow">Google Maps Overlay</p>
          <h2 id="sound-map-title">Study space search map</h2>
        </div>
        <p className="map-shell__status">{statusMessage}</p>
      </div>

      <div className="map-search">
        <label className="map-search__label" htmlFor="map-location-search">
          Search buildings, floors, and sublocations
        </label>
        <div className="map-search__controls">
          <input
            id="map-location-search"
            type="search"
            className="map-search__input"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Try Library Floor 4 or Quiet Study"
          />
          {searchInput ? (
            <button
              type="button"
              className="map-search__clear"
              onClick={() => setSearchInput('')}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="map-toolbar" role="toolbar" aria-label="Map severity filters">
        {SEVERITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`map-chip ${severityFilter === option ? 'is-active' : ''}`}
            onClick={() => setSeverityFilter(option)}
          >
            {option === 'all' ? 'All levels' : `${severityLabel(option)} only`}
          </button>
        ))}
      </div>

      <div className="map-layout">
        <div className={`map-stage ${isUsingMapFallback ? 'is-fallback' : ''}`}>
          <div ref={mapContainerRef} className="map-stage__canvas" />
          {isUsingMapFallback ? (
            <div className="map-stage__fallback">
              <div className="map-stage__fallback-grid" aria-hidden="true" />
              {fallbackPreviewPoints.map((point) => (
                <div
                  key={`heat-${point.id}`}
                  className="map-stage__fallback-heat"
                  style={{
                    left: point.left,
                    top: point.top,
                    width: `${point.radius * 0.8}px`,
                    height: `${point.radius * 0.8}px`,
                    background: heatGradient(point.color, point.intensity),
                  }}
                />
              ))}
              {fallbackPreviewPoints.map((point) => (
                <div
                  key={point.id}
                  className={`map-stage__fallback-marker is-${point.markerVariant}`}
                  style={{ left: point.left, top: point.top }}
                  aria-hidden="true"
                >
                  <span className="map-stage__fallback-pin" />
                  <span
                    className="map-stage__fallback-badge"
                    style={{ backgroundColor: point.color }}
                  />
                </div>
              ))}
              <div className="map-stage__fallback-copy">
                <p>Google Maps is waiting for a browser API key.</p>
                <p>
                  Add <code>VITE_GOOGLE_MAPS_API_KEY</code> in your frontend environment to
                  replace this placeholder with the live basemap.
                </p>
              </div>
            </div>
          ) : null}

          <div className="map-legend" aria-label="Map legend">
            <span className="map-legend__label">Placeholder overlays</span>
            <div className="map-legend__items">
              <span className="map-legend__item">
                <span className="map-legend__pin" />
                Primary pin
              </span>
              <span className="map-legend__item">
                <span className="map-legend__pin map-legend__pin--mini" />
                Sublocation
              </span>
              <span className="map-legend__item">
                <span className="map-legend__sound" />
                Noise badge
              </span>
            </div>
            <div className="map-legend__scale" aria-hidden="true">
              <span>Quiet</span>
              <span className="map-legend__gradient" />
              <span>Loud</span>
            </div>
          </div>

          {popupLocation ? (
            <article className="map-popup" aria-live="polite">
              <div className="map-popup__topline">
                <span className={`map-popup__badge severity-${popupLocation.severity ?? 'low'}`}>
                  {severityLabel(popupLocation.severity)}
                </span>
                {popupLocation.isFavorite ? (
                  <span className="map-popup__favorite" aria-label="Favorite location">
                    Favorite
                  </span>
                ) : null}
              </div>
              <h3>{formatLocationHeading(popupLocation)}</h3>
              {popupLocation.sublocationLabel ? (
                <p className="map-popup__subtitle">{popupLocation.sublocationLabel}</p>
              ) : null}
              <p>{popupLocation.summary ?? 'No summary available for this location yet.'}</p>
              <dl className="map-popup__meta">
                {popupLocation.statusText ? (
                  <div>
                    <dt>Status</dt>
                    <dd>{popupLocation.statusText}</dd>
                  </div>
                ) : null}
                {popupLocation.noiseText ? (
                  <div>
                    <dt>Noise</dt>
                    <dd>{popupLocation.noiseText}</dd>
                  </div>
                ) : null}
                {popupLocation.occupancyText ? (
                  <div>
                    <dt>Occupancy</dt>
                    <dd>{popupLocation.occupancyText}</dd>
                  </div>
                ) : null}
                {popupLocation.updatedAtLabel ? (
                  <div>
                    <dt>Updated</dt>
                    <dd>{popupLocation.updatedAtLabel}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Heat Source</dt>
                  <dd>
                    {popupLocation.sublocationLabel
                      ? 'Currently driven by sublocation coordinates'
                      : 'Currently driven by location coordinates'}
                  </dd>
                </div>
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    {popupLocation.lat.toFixed(4)}, {popupLocation.lng.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt>Marker type</dt>
                  <dd>{inferMarkerVariant(popupLocation) === 'mini-pin' ? 'mini-pin' : 'pin'}</dd>
                </div>
              </dl>
            </article>
          ) : (
            <article className="map-popup map-popup--empty">
              <h3>No location selected</h3>
              <p>
                {isSearching
                  ? 'Choose a search result to center the map and open details.'
                  : 'Tap a pin to open its text popup.'}
              </p>
            </article>
          )}
        </div>

        <aside className="map-list" aria-label="Map locations">
          {filteredLocations.length > 0 ? (
            filteredLocations.map((location) => (
              <button
                key={location.id}
                type="button"
                className={`map-list__item ${selectedId === location.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(location.id)}
              >
                <span className="map-list__rail" aria-hidden="true">
                  <span
                    className={`map-list__marker ${inferMarkerVariant(location) === 'mini-pin' ? 'is-mini' : ''}`}
                  >
                    <span
                      className="map-list__swatch"
                      style={{ backgroundColor: buildMarkerTone(location, inferNoiseValue(location)) }}
                    />
                    <span
                      className="map-list__sound"
                      style={{ backgroundColor: buildHeatColor(inferNoiseValue(location)) }}
                    />
                  </span>
                  {location.isFavorite ? <span className="map-list__favorite">Fav</span> : null}
                </span>
                <span className="map-list__content">
                  <strong>{formatLocationHeading(location)}</strong>
                  {location.sublocationLabel ? <span>{location.sublocationLabel}</span> : null}
                  <span>{location.summary ?? 'No summary available.'}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="map-list__empty">{emptyStateMessage}</div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default MapExplorer;
