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
//         → sortedLocations (by sortOrder)
//           → passed to MapMarkers, MapHeatOverlay, MapLocationList

import { useEffect, useMemo, useState } from 'react';
import type { AnnotationSeverity, MapAnnotationsResponse, MapLocation } from '../../types/mapAnnotations.ts';
import { buildSearchableText, inferNoiseValue } from '../../lib/mapUtils.ts';
import MapProvider from './MapProvider.tsx';
import MapCanvas from './MapCanvas.tsx';
import MapMarkers from './MapMarkers.tsx';
import MapHeatOverlay from './MapHeatOverlay.tsx';
import MapInfoPopup from './MapInfoPopup.tsx';
import MapLocationList from './MapLocationList.tsx';
import { useFavorites } from '../../useFavorites.ts';
import FavoritesDrawer from '../FavoritesDrawer.tsx';

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

// Sorts locations so those whose name starts with the query float to the top.
// Everything else keeps its original order (stable sort).
function sortByRelevance(locations: MapLocation[], query: string): MapLocation[] {
  if (!query) return locations; // no search active → original order
  return [...locations].sort((a, b) => {
    const aName = (a.buildingName ?? a.title).toLowerCase();
    const bName = (b.buildingName ?? b.title).toLowerCase();
    const aStarts = aName.startsWith(query) ? 0 : 1; // 0 = higher priority
    const bStarts = bName.startsWith(query) ? 0 : 1;
    return aStarts - bStarts; // sort: starts-with matches come first
  });
}

// Sorts locations by noise intensity (0 = quiet, 1 = loud).
// direction 'asc' = quietest first, 'desc' = loudest first.
function sortByNoise(locations: MapLocation[], direction: 'asc' | 'desc'): MapLocation[] {
  return [...locations].sort((a, b) => {
    const diff = inferNoiseValue(a) - inferNoiseValue(b);
    return direction === 'asc' ? diff : -diff; // flip sign for loudest-first
  });
}

// ---- Component --------------------------------------------------------------

function MapExplorer() {
  // ---- State ----------------------------------------------------------------

  // Raw location list from the API — never modified after fetch
  const [locations, setLocations] = useState<MapLocation[]>([]);

  // Loading and error states for the fetch
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  // ID of the currently selected location — drives pin highlight + map pan
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // What the user has typed in the search box (raw, updates on every keystroke)
  const [searchInput, setSearchInput] = useState('');

  // Debounced version of searchInput — only updates 180ms after the user stops typing.
  // We filter by this instead of searchInput so we don't re-filter on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Which severity chip is active
  const [severityFilter, setSeverityFilter] = useState<AnnotationSeverity | 'all'>('all');

  // Which sort option is active
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');

  const { favorites, isFavorite, toggleFavorite } = useFavorites(); 


  // ---- Effects --------------------------------------------------------------

  // Fetch location data from the backend on mount.
  // isActive flag prevents state updates if the component unmounts before fetch completes.
  useEffect(() => {
    let isActive = true;

    async function fetchLocations() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch('http://localhost:5050/api/map-annotations');
        const data: MapAnnotationsResponse = await res.json();

        if (!isActive) return;

        if (data.error) {
          // API returned an application-level error
          setErrorMsg(data.error);
          setLocations([]);
        } else {
          setLocations(data.results);
          // Auto-select the first result so the map pans to it on load
          setSelectedId(data.results[0]?.id ?? null);
        }
      } catch (err) {
        if (!isActive) return;
        // Network error or JSON parse failure
        setErrorMsg(err instanceof Error ? err.message : 'Could not reach the server.');
        setLocations([]);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void fetchLocations();

    // Cleanup: if this component unmounts while fetching, ignore the result
    return () => { isActive = false; };
  }, []); // empty array = run once on mount

  // Debounce: wait 180ms after the user stops typing before updating debouncedSearch.
  // This prevents re-filtering on every single keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 180);
    return () => window.clearTimeout(timer); // cancel the timer if user types again
  }, [searchInput]); // re-run every time searchInput changes

  // ---- Derived data (useMemo — recomputes only when inputs change) ----------

  // Step 1: filter by search text
  const searchFiltered = useMemo(() => {
    if (!debouncedSearch) return locations; // no search → show everything
    // buildSearchableText combines all searchable fields into one lowercase string
    return locations.filter((loc) => buildSearchableText(loc).includes(debouncedSearch));
  }, [locations, debouncedSearch]);

  // Step 2: filter by severity chip
  const severityFiltered = useMemo(() => {
    if (severityFilter === 'all') return searchFiltered;
    return searchFiltered.filter((loc) => loc.severity === severityFilter);
  }, [searchFiltered, severityFilter]);

  // Step 3: sort the remaining locations
  const sortedLocations = useMemo(() => {
    if (sortOrder === 'noise-asc')  return sortByNoise(severityFiltered, 'asc');
    if (sortOrder === 'noise-desc') return sortByNoise(severityFiltered, 'desc');
    return sortByRelevance(severityFiltered, debouncedSearch); // 'relevance' is default
  }, [severityFiltered, sortOrder, debouncedSearch]);

  // Keep selectedId valid: if the selected item was removed by a filter change,
  // auto-select the first visible result.
  // IMPORTANT: skip when selectedId is null — that means the user deliberately
  // closed the popup, and we must not immediately re-open it.
  useEffect(() => {
    if (selectedId === null) return;         // user closed the popup → do nothing
    if (sortedLocations.length === 0) return;
    const stillVisible = sortedLocations.some((l) => l.id === selectedId);
    if (!stillVisible) setSelectedId(sortedLocations[0].id); // item filtered out → pick first
  }, [sortedLocations, selectedId]);

  // The full location object for the currently selected ID — passed to the popup.
  // Search across ALL locations (not just filtered) so the popup still shows
  // even if filters are changed while a pin is open.
  const selectedLocation = locations.find((l) => l.id === selectedId) ?? null;

  // ---- Render ---------------------------------------------------------------

  return (
    <section className="map-page">

      {/* ---- Controls bar: title, search, sort, filter chips ---- */}
      <header className="map-controls-bar">

        {/* Left side: title and subtitle */}
        <div className="map-controls-title">
          <p className="map-controls-eyebrow">SpotStudy</p>
          <h2>Study Space Search</h2>
          <p className="map-controls-subtitle">Search from the current map center</p>
        </div>

        {/* Right side: search + sort + filter chips */}
        <div className="map-controls-right">

          {/* Search input + clear button */}
          <div className="map-controls-search">
            <input
              type="search"
              className="map-search__input"
              placeholder="Search Library or Quiet Study"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search study spaces"
            />
            {/* Only show the clear button when there is text to clear */}
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

          {/* Sort order dropdown + filter chips in one row */}
          <div className="map-controls-filters-row">

            {/* Sort dropdown */}
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

            {/* Severity filter chips — one button per option */}
            <div className="map-filter-chips" role="group" aria-label="Filter by noise level">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`map-chip ${severityFilter === opt ? 'is-active' : ''}`}
                  onClick={() => setSeverityFilter(opt)}
                >
                  {/* "All levels" for 'all', capitalized label for others */}
                  {opt === 'all' ? 'All levels' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

        </div>
      </header>

      {/* ---- Status line: loading / error / count ---- */}
      {isLoading && <p className="map-status">Loading study spaces...</p>}
      {errorMsg  && <p className="map-status map-status--error">{errorMsg}</p>}
      {!isLoading && !errorMsg && (
        <p className="map-status">
          {sortedLocations.length} location{sortedLocations.length !== 1 ? 's' : ''} shown
        </p>
      )}

      {/* ---- Body: map canvas (left) + sidebar card list (right) ---- */}
      <div className="map-body-row">

        {/* Map canvas — takes up the remaining width */}
        <div className="map-canvas-wrapper">
          {/*
            MapProvider wraps everything in APIProvider, which loads the Google Maps
            JavaScript API exactly once and makes useMap() / useMapsLibrary() available
            to all children.
          */}
          <MapProvider apiKey={GOOGLE_MAPS_API_KEY}>
            {/*
              MapCanvas renders the <Map> component — this creates the actual
              google.maps.Map instance and puts it into React context.
              Children rendered inside <Map> can call useMap() to get the instance.
            */}
            <MapCanvas onMapClick={() => setSelectedId(null)}>
              {/*
                MapMarkers renders one AdvancedMarker per location.
                The camera controller (pan + zoom) lives inside here.
              */}
              <MapMarkers
                locations={sortedLocations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {/*
                MapHeatOverlay draws the diffuse noise blobs directly on the map
                canvas using OverlayView — not floating above the map.
              */}
              <MapHeatOverlay locations={sortedLocations} />
              {/* Info popup anchored to the selected pin on the map canvas */}
              <MapInfoPopup
                location={selectedLocation}
                onClose={() => setSelectedId(null)}
                isFavorite={selectedLocation ? isFavorite(selectedLocation.id) : false}
                onToggleFavorite={toggleFavorite}
              />
            </MapCanvas>
          </MapProvider>
        </div>

        {/* Right sidebar: scrollable list of location cards */}
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

      {/* Favorites drawer */}
      <FavoritesDrawer
        locations={locations}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onSelectLocation={(id) => {
          setSelectedId(id);
        }}
      />

    </section>
  );
}

export default MapExplorer;
