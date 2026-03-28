import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMapsApi } from '../lib/googleMaps.ts';
import type {
  AnnotationSeverity,
  MapAnnotation,
  MapAnnotationsResponse,
} from '../types/mapAnnotations.ts';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_CENTER = { lat: 28.5383, lng: -81.3792 };
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

function severityLabel(severity: AnnotationSeverity | undefined): string {
  if (!severity) {
    return 'Unrated';
  }

  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function createPinIcon(annotation: MapAnnotation, isSelected: boolean): string {
  const fill = annotation.color ?? '#3a86ff';
  const stroke = isSelected ? '#081220' : '#ffffff';
  const iconLabel = (annotation.iconType ?? annotation.title).slice(0, 1).toUpperCase();
  const scale = isSelected ? 1.08 : 1;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="58" height="70" viewBox="0 0 58 70">
      <g transform="scale(${scale}) translate(${isSelected ? '-2' : '0'} ${isSelected ? '-2' : '0'})">
        <path d="M29 2C15.2 2 4 13.2 4 27c0 18.4 20.4 37.7 23.4 40.5a2.4 2.4 0 0 0 3.2 0C33.6 64.7 54 45.4 54 27 54 13.2 42.8 2 29 2Z" fill="${fill}" stroke="${stroke}" stroke-width="4" />
        <circle cx="29" cy="27" r="12" fill="rgba(255,255,255,0.92)" />
        <text x="29" y="31" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#081220">${iconLabel}</text>
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function MapExplorer() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<MarkerWithMetadata[]>([]);
  const hasFittedBoundsRef = useRef(false);

  const [annotations, setAnnotations] = useState<MapAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<AnnotationSeverity | 'all'>('all');
  const [statusMessage, setStatusMessage] = useState('Loading sound map…');
  const [mapReady, setMapReady] = useState(false);
  const [isUsingMapFallback, setIsUsingMapFallback] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function fetchAnnotations(): Promise<void> {
      try {
        const response = await fetch('http://localhost:5000/api/map-annotations');
        const payload: MapAnnotationsResponse = await response.json();

        if (!isActive) {
          return;
        }

        if (payload.error) {
          setAnnotations([]);
          setStatusMessage(payload.error);
          return;
        }

        setAnnotations(payload.results);
        setSelectedId(payload.results[0]?.id ?? null);
        setStatusMessage(
          payload.results.length > 0
            ? `${payload.results.length} live map annotations loaded`
            : 'No map annotations available',
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const fallback =
          error instanceof Error ? error.message : 'Unable to load map annotations';
        setAnnotations([]);
        setStatusMessage(fallback);
      }
    }

    void fetchAnnotations();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredAnnotations = useMemo(() => {
    if (severityFilter === 'all') {
      return annotations;
    }

    return annotations.filter((annotation) => annotation.severity === severityFilter);
  }, [annotations, severityFilter]);

  const selectedAnnotation = useMemo(() => {
    const source = filteredAnnotations.length > 0 ? filteredAnnotations : annotations;
    return source.find((annotation) => annotation.id === selectedId) ?? source[0] ?? null;
  }, [annotations, filteredAnnotations, selectedId]);

  useEffect(() => {
    if (!selectedAnnotation && filteredAnnotations.length > 0) {
      setSelectedId(filteredAnnotations[0].id);
    }
  }, [filteredAnnotations, selectedAnnotation]);

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
    };
  }, []);

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

    const activeAnnotations = filteredAnnotations.map((annotation) => ({
      ...annotation,
      isSelected: annotation.id === selectedId,
    }));

    if (activeAnnotations.length === 0) {
      return;
    }

    const googleMaps = map.getDiv().ownerDocument.defaultView?.google;

    if (!googleMaps) {
      return;
    }

    const bounds = new googleMaps.maps.LatLngBounds();

    for (const annotation of activeAnnotations) {
      const marker = new googleMaps.maps.Marker({
        map,
        position: { lat: annotation.lat, lng: annotation.lng },
        title: annotation.title,
        icon: {
          url: createPinIcon(annotation, Boolean(annotation.isSelected)),
          scaledSize: new googleMaps.maps.Size(
            annotation.isSelected ? 58 : 54,
            annotation.isSelected ? 70 : 66,
          ),
        },
      });

      const listener = marker.addListener('click', () => {
        setSelectedId(annotation.id);
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
  }, [filteredAnnotations, mapReady, selectedId]);

  const popupAnnotation = selectedAnnotation;

  return (
    <section className="map-shell" aria-labelledby="sound-map-title">
      <div className="map-shell__header">
        <div>
          <p className="eyebrow">Google Maps Overlay</p>
          <h2 id="sound-map-title">Sound activity map</h2>
        </div>
        <p className="map-shell__status">{statusMessage}</p>
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
              <p>Google Maps is waiting for a browser API key.</p>
              <p>
                Add <code>VITE_GOOGLE_MAPS_API_KEY</code> in your frontend environment to
                replace this placeholder with the live basemap.
              </p>
            </div>
          ) : null}

          {popupAnnotation ? (
            <article className="map-popup" aria-live="polite">
              <span
                className={`map-popup__badge severity-${popupAnnotation.severity ?? 'low'}`}
              >
                {severityLabel(popupAnnotation.severity)}
              </span>
              <h3>{popupAnnotation.title}</h3>
              <p>{popupAnnotation.body}</p>
              <dl className="map-popup__meta">
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    {popupAnnotation.lat.toFixed(4)}, {popupAnnotation.lng.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt>Marker type</dt>
                  <dd>{popupAnnotation.iconType ?? 'default'}</dd>
                </div>
              </dl>
            </article>
          ) : (
            <article className="map-popup map-popup--empty">
              <h3>No location selected</h3>
              <p>Tap a pin to open its text popup.</p>
            </article>
          )}
        </div>

        <aside className="map-list" aria-label="Map locations">
          {filteredAnnotations.length > 0 ? (
            filteredAnnotations.map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                className={`map-list__item ${
                  selectedId === annotation.id ? 'is-selected' : ''
                }`}
                onClick={() => setSelectedId(annotation.id)}
              >
                <span
                  className="map-list__swatch"
                  style={{ backgroundColor: annotation.color ?? '#3a86ff' }}
                  aria-hidden="true"
                />
                <span className="map-list__content">
                  <strong>{annotation.title}</strong>
                  <span>{annotation.body}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="map-list__empty">No annotations match this filter.</div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default MapExplorer;
