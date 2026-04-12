// MapExplorer — the top-level component for the study space map page.
//
// This is the ONLY component that holds state. It:
//   1. Fetches location data from the API
//   2. Filters and sorts that data based on user input
//   3. Renders the controls bar (search, sort, filters)
//   4. Passes filtered data down to the map and sidebar
//
// It does NOT touch the google.maps API directly — that's handled by
// MapCanvas, MapMarkers, and MapHeatOverlay.
//
// Data flow:
//   fetch → locations
//     → searchFiltered (by debouncedSearch)
//       → severityFiltered (by severityFilter)
//         → rangeFiltered (by minNoise / maxNoise / maxOccupancy)
//           → sortedLocations (by sortOrder)
//             → zoom-aware filtering for sidebar vs map

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnnotationSeverity, MapAnnotationsResponse, MapLocation } from '../../types/mapAnnotations.ts';
import { buildSearchableText, inferNoiseValue } from '../../lib/mapUtils.ts';
import MapProvider from './MapProvider.tsx';
import MapCanvas from './MapCanvas.tsx';
import MapMarkers, { ZOOM_THRESHOLD } from './MapMarkers.tsx';
import MapHeatOverlay from './MapHeatOverlay.tsx';
import MapInfoPopup from './MapInfoPopup.tsx';
import MapLocationList from './MapLocationList.tsx';
import { useMarkerAnimation } from './mapMarkerAnimation.ts';
import { useFavorites } from '../../useFavorites.ts';
import FavoritesDrawer from '../FavoritesDrawer.tsx';
import { apiUrl } from '../../config';

// The API key is read from .env at build time (VITE_ prefix makes it browser-accessible)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

// Severity filter options shown as chip buttons
const SEVERITY_OPTIONS: Array<AnnotationSeverity | 'all'> = ['all', 'high', 'medium', 'low'];

// Sort order options shown in the dropdown
type SortOrder = 'relevance' | 'noise-asc' | 'noise-desc';
const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'relevance',  label: 'Relevance' },
  { value: 'noise-asc',  label: 'Quietest first' },
  { value: 'noise-desc', label: 'Loudest first' },
];

// ---- Sort helpers (pure functions — no side effects) ------------------------

function sortByRelevance(locations: MapLocation[], query: string): MapLocation[] {
  if (!query) return locations;
  return [...locations].sort((a, b) => {
    const aName = (a.buildingName ?? a.title).toLowerCase();
    const bName = (b.buildingName ?? b.title).toLowerCase();
    const aStarts = aName.startsWith(query) ? 0 : 1;
    const bStarts = bName.startsWith(query) ? 0 : 1;
    return aStarts - bStarts;
  });
}

function sortByNoise(locations: MapLocation[], direction: 'asc' | 'desc'): MapLocation[] {
  return [...locations].sort((a, b) => {
    const diff = inferNoiseValue(a) - inferNoiseValue(b);
    return direction === 'asc' ? diff : -diff;
  });
}

// ---- Component --------------------------------------------------------------

type MapExplorerProps = {
  favoritesOpen?: boolean;
  onFavoritesClose?: () => void;
};

function MapExplorer({ favoritesOpen, onFavoritesClose }: MapExplorerProps) {
  // ---- State ----------------------------------------------------------------

  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AnnotationSeverity | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');

  // Range filters — stored as strings so inputs stay controlled while typing
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minNoiseStr, setMinNoiseStr] = useState('');
  const [maxNoiseStr, setMaxNoiseStr] = useState('');
  const [maxOccupancyStr, setMaxOccupancyStr] = useState('');

  // Parsed numeric values (null when input is empty or non-numeric)
  const minNoise = minNoiseStr !== '' && Number.isFinite(Number(minNoiseStr)) ? Number(minNoiseStr) : null;
  const maxNoise = maxNoiseStr !== '' && Number.isFinite(Number(maxNoiseStr)) ? Number(maxNoiseStr) : null;
  const maxOccupancy = maxOccupancyStr !== '' && Number.isFinite(Number(maxOccupancyStr)) ? Number(maxOccupancyStr) : null;

  const activeFilterCount = [minNoise, maxNoise, maxOccupancy].filter((v) => v !== null).length;
  const hasActiveFilters = activeFilterCount > 0;

  function clearRangeFilters() {
    setMinNoiseStr('');
    setMaxNoiseStr('');
    setMaxOccupancyStr('');
  }

  // Current map zoom — reported up from MapMarkers via onZoomChange
  const [mapZoom, setMapZoom] = useState<number>(0);
  const isZoomedIn = mapZoom >= ZOOM_THRESHOLD;

  const { isFavorite, toggleFavorite } = useFavorites();
  const animation = useMarkerAnimation();

  // Stable callback for MapMarkers to report zoom changes
  const handleZoomChange = useCallback((z: number) => setMapZoom(z), []);

  // ---- Reusable fetch -------------------------------------------------------

  const fetchLocations = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(apiUrl('/api/map-annotations'), { signal });
      const data: MapAnnotationsResponse = await res.json();

      if (signal?.aborted) return;

      if (data.error) {
        setErrorMsg(data.error);
        setLocations([]);
      } else {
        setLocations(data.results);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setErrorMsg(err instanceof Error ? err.message : 'Could not reach the server.');
      setLocations([]);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  // ---- Effects --------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    void fetchLocations(controller.signal);
    return () => controller.abort();
  }, [fetchLocations]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // ---- Derived data ---------------------------------------------------------

  // Zoom-aware base set: when zoomed out show groups, when zoomed in show locations
  const zoomFiltered = useMemo(() => {
    if (isZoomedIn) return locations.filter((l) => l.kind !== 'group');
    return locations.filter((l) => l.kind === 'group');
  }, [locations, isZoomedIn]);

  // Heatmap always draws from individual spots so each study area shows its own
  // blob, even when zoomed out and the sidebar/markers show groups.
  const heatmapLocations = useMemo(() => {
    return locations.filter((l) => l.kind !== 'group');
  }, [locations]);

  // Step 1: filter by search text
  const searchFiltered = useMemo(() => {
    if (!debouncedSearch) return zoomFiltered;
    return zoomFiltered.filter((loc) => buildSearchableText(loc).includes(debouncedSearch));
  }, [zoomFiltered, debouncedSearch]);

  // Step 2: filter by severity chip
  const severityFiltered = useMemo(() => {
    if (severityFilter === 'all') return searchFiltered;
    return searchFiltered.filter((loc) => loc.severity === severityFilter);
  }, [searchFiltered, severityFilter]);

  // Step 3: filter by noise range and max occupancy
  // Locations with no live data (noiseValue/occupancyValue is null) are excluded
  // when the corresponding filter is active — same behaviour as the backend service.
  const rangeFiltered = useMemo(() => {
    let result = severityFiltered;
    if (minNoise !== null) {
      result = result.filter((l) => Number.isFinite(l.noiseValue) && (l.noiseValue as number) >= minNoise);
    }
    if (maxNoise !== null) {
      result = result.filter((l) => Number.isFinite(l.noiseValue) && (l.noiseValue as number) <= maxNoise);
    }
    if (maxOccupancy !== null) {
      result = result.filter((l) => Number.isFinite(l.occupancyValue) && (l.occupancyValue as number) <= maxOccupancy);
    }
    return result;
  }, [severityFiltered, minNoise, maxNoise, maxOccupancy]);

  // Step 4: sort
  const sortedLocations = useMemo(() => {
    if (sortOrder === 'noise-asc')  return sortByNoise(rangeFiltered, 'asc');
    if (sortOrder === 'noise-desc') return sortByNoise(rangeFiltered, 'desc');
    return sortByRelevance(rangeFiltered, debouncedSearch);
  }, [rangeFiltered, sortOrder, debouncedSearch]);

  // Keep selectedId valid when filters change
  useEffect(() => {
    if (selectedId === null) return;
    if (sortedLocations.length === 0) return;
    const stillVisible = sortedLocations.some((l) => l.id === selectedId);
    if (!stillVisible) setSelectedId(sortedLocations[0].id);
  }, [sortedLocations, selectedId]);

  const selectedLocation = locations.find((l) => l.id === selectedId) ?? null;

  // ---- Render ---------------------------------------------------------------

  return (
    <section className="map-page">

      <header className="map-controls-bar">
        <div className="map-controls-title">
          <p className="map-controls-eyebrow">SpotStudy</p>
          <h2>Study Space Search</h2>
          <p className="map-controls-subtitle">Search from the current map center</p>
        </div>

        <div className="map-controls-right">
          <div className="map-controls-search">
            <input
              type="search"
              className="map-search__input"
              placeholder="Search Library or Quiet Study"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search study spaces"
            />
            {searchInput && (
              <button
                type="button"
                className="map-search__clear"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="map-controls-filters-row">
            <label className="map-sort-label">
              <span>1st by</span>
              <select
                className="map-sort-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <div className="map-filter-chips" role="group" aria-label="Filter by noise level">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`map-chip ${severityFilter === opt ? 'is-active' : ''}`}
                  onClick={() => setSeverityFilter(opt)}
                >
                  {opt === 'all' ? 'All levels' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`map-chip map-chip--filters ${(hasActiveFilters || filtersOpen) ? 'is-active' : ''}`}
              onClick={() => setFiltersOpen((p) => !p)}
              aria-expanded={filtersOpen}
              aria-label="Toggle range filters"
            >
              {hasActiveFilters ? `Filters (${activeFilterCount})` : 'Filters'}
              <span className="map-chip-caret" aria-hidden="true">{filtersOpen ? ' ▲' : ' ▼'}</span>
            </button>
          </div>

          {filtersOpen && (
            <div className="map-range-filters-row" role="group" aria-label="Range filters">
              <label className="map-sort-label">
                <span>Min dB</span>
                <input
                  type="number"
                  className="map-filter-input"
                  placeholder="e.g. 30"
                  min="0"
                  max="120"
                  step="1"
                  value={minNoiseStr}
                  onChange={(e) => setMinNoiseStr(e.target.value)}
                  aria-label="Minimum noise level in decibels"
                />
              </label>
              <label className="map-sort-label">
                <span>Max dB</span>
                <input
                  type="number"
                  className="map-filter-input"
                  placeholder="e.g. 80"
                  min="0"
                  max="120"
                  step="1"
                  value={maxNoiseStr}
                  onChange={(e) => setMaxNoiseStr(e.target.value)}
                  aria-label="Maximum noise level in decibels"
                />
              </label>
              {minNoise !== null && maxNoise !== null && minNoise > maxNoise && (
                <span className="map-filter-warning">Min &gt; Max</span>
              )}
              <label className="map-sort-label">
                <span>Max occupancy</span>
                <select
                  className="map-sort-select"
                  value={maxOccupancyStr}
                  onChange={(e) => setMaxOccupancyStr(e.target.value)}
                  aria-label="Maximum occupancy level"
                >
                  <option value="">Any</option>
                  <option value="1">≤ 1 / 5</option>
                  <option value="2">≤ 2 / 5</option>
                  <option value="3">≤ 3 / 5</option>
                  <option value="4">≤ 4 / 5</option>
                </select>
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="map-chip"
                  onClick={clearRangeFilters}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="map-status-row">
        {isLoading && <p className="map-status">Loading study spaces...</p>}
        {errorMsg  && <p className="map-status map-status--error">{errorMsg}</p>}
        {!isLoading && !errorMsg && (
          <p className="map-status">
            {sortedLocations.length} location{sortedLocations.length !== 1 ? 's' : ''} shown
          </p>
        )}
        <button
          type="button"
          className="map-refresh-btn"
          disabled={isLoading}
          onClick={() => void fetchLocations()}
          aria-label="Refresh study spaces"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="map-body-row">
        <div className="map-canvas-wrapper">
          <MapProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <MapCanvas onMapClick={() => setSelectedId(null)}>
              {/* MapMarkers gets ALL locations — it handles zoom-based visibility internally */}
              <MapMarkers
                locations={locations}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onZoomChange={handleZoomChange}
                animation={animation}
              />
              <MapHeatOverlay locations={heatmapLocations} />
              <MapInfoPopup
                location={selectedLocation}
                onClose={() => setSelectedId(null)}
                isFavorite={selectedLocation ? isFavorite(selectedLocation.id) : false}
                onToggleFavorite={toggleFavorite}
              />
            </MapCanvas>
          </MapProvider>
        </div>

        <aside className="map-sidebar" aria-label="Study space list">
          <MapLocationList
            locations={sortedLocations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </aside>
      </div>

      <FavoritesDrawer
        locations={locations}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onSelectLocation={(id) => { setSelectedId(id); }}
        isOpen={favoritesOpen}
        onClose={onFavoritesClose}
      />

    </section>
  );
}

export default MapExplorer;