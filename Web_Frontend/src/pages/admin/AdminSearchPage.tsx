import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../../config';
import AdminSearchResults from '../../components/admin/AdminSearchResults.tsx';
import AdminSearchMap from '../../components/admin/AdminSearchMap.tsx';
import AdminLocationDetail from '../../components/admin/AdminLocationDetail.tsx';
import '../../components/admin/AdminSearch.css';

export type SearchResultItem = {
  id: string;
  kind: 'group' | 'location';
  name: string;
  parentName?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  floorLabel?: string;
  sublocationLabel?: string;
};

type SearchApiGroup = {
  locationGroupId: string;
  name: string;
  center?: { lat: number; lng: number };
  radius?: number;
};

type SearchApiLocation = {
  studyLocationId: string;
  name: string;
  groupName?: string;
  lat?: number;
  lng?: number;
  floorLabel?: string;
  sublocationLabel?: string;
};

type SearchApiResponse = {
  groups: SearchApiGroup[];
  studyLocations: SearchApiLocation[];
  error?: string;
};

function AdminSearchPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<SearchResultItem | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchResults = useCallback(async (query: string) => {
    if (!query) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/admin/search?q=${encodeURIComponent(query)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: SearchApiResponse = await res.json();

      if (!res.ok || data.error) {
        setResults([]);
        return;
      }

      const items: SearchResultItem[] = [
        ...data.groups.map((g): SearchResultItem => ({
          id: g.locationGroupId,
          kind: 'group',
          name: g.name,
          lat: g.center?.lat,
          lng: g.center?.lng,
          radius: g.radius,
        })),
        ...data.studyLocations.map((l): SearchResultItem => ({
          id: l.studyLocationId,
          kind: 'location',
          name: l.name,
          parentName: l.groupName,
          lat: l.lat,
          lng: l.lng,
          floorLabel: l.floorLabel,
          sublocationLabel: l.sublocationLabel,
        })),
      ];

      setResults(items);

      if (items.length > 0 && !selectedRef.current) {
        setSelected(items[0]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResults(debouncedQuery);
  }, [debouncedQuery, fetchResults]);

  function handleSelect(item: SearchResultItem) {
    setSelected(item);
  }

  return (
    <section className="admin-search-page">
      <div className="admin-search-bar">
        <div className="admin-search-bar__title">
          <p className="admin-search-bar__eyebrow">Admin</p>
          <h2>Location Search</h2>
        </div>
        <div className="admin-search-bar__input-wrapper">
          <input
            type="search"
            className="admin-search-bar__input"
            placeholder="Search locations and groups..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search locations"
          />
          {searchInput && (
            <button
              type="button"
              className="admin-search-bar__clear"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
            >
              x
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="admin-search-bar__status">Searching...</p>
      )}

      <div className="admin-split-view">
        <div className="admin-results-panel">
          <AdminSearchResults
            results={results}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
        <div className="admin-map-panel">
          <AdminSearchMap
            results={results}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <div className="admin-detail-panel">
        {selected ? (
          <AdminLocationDetail
            selected={selected}
            onSelectChild={handleSelect}
          />
        ) : (
          <div className="admin-detail__no-selection">
            Search for a location or group above to view details
          </div>
        )}
      </div>
    </section>
  );
}

export default AdminSearchPage;
