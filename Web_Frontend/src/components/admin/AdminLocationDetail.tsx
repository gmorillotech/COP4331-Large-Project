import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../../config';
import { ADMIN_UI_TUNING } from '../../config/uiTuning.ts';
import type { SearchResultItem } from '../../pages/admin/AdminSearchPage.tsx';
import AdminReportTable from './AdminReportTable.tsx';

type ChildLocation = {
  studyLocationId: string;
  name: string;
  floorLabel?: string;
  sublocationLabel?: string;
  lat?: number;
  lng?: number;
};

type AdminLocationDetailProps = {
  selected: SearchResultItem;
  onSelectChild?: (item: SearchResultItem) => void;
};

function AdminLocationDetail({ selected, onSelectChild }: AdminLocationDetailProps) {
  const isGroup = selected.kind === 'group';

  const [childLocations, setChildLocations] = useState<ChildLocation[]>([]);
  const [childLoading, setChildLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [debouncedReportSearch, setDebouncedReportSearch] = useState('');
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedReportSearch(reportSearch.trim());
    }, ADMIN_UI_TUNING.locationDetailSearchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [reportSearch]);

  useEffect(() => {
    setReportSearch('');
    setDebouncedReportSearch('');
    setReportRefreshKey((k) => k + 1);
  }, [selected.id]);

  const fetchChildren = useCallback(async () => {
    if (!isGroup) {
      setChildLocations([]);
      return;
    }

    setChildLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/locations/groups/${selected.id}/locations`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: ChildLocation[] = await res.json();
        setChildLocations(data);
      } else {
        setChildLocations([]);
      }
    } catch {
      setChildLocations([]);
    } finally {
      setChildLoading(false);
    }
  }, [isGroup, selected.id]);

  useEffect(() => {
    void fetchChildren();
  }, [fetchChildren]);

  function handleChildClick(child: ChildLocation) {
    if (!onSelectChild) return;
    onSelectChild({
      id: child.studyLocationId,
      kind: 'location',
      name: child.name,
      parentName: selected.name,
      lat: child.lat ?? selected.lat,
      lng: child.lng ?? selected.lng,
      floorLabel: child.floorLabel,
      sublocationLabel: child.sublocationLabel,
    });
  }

  return (
    <div className="admin-detail">
      {/* Header */}
      <div className="admin-detail__header">
        <h2 className="admin-detail__title">{selected.name}</h2>
        <span
          className={`admin-detail__type-badge ${isGroup ? 'admin-detail__type-badge--group' : 'admin-detail__type-badge--location'}`}
        >
          {isGroup ? 'Location Group' : 'Study Location'}
        </span>
      </div>

      {/* Metadata */}
      <div className="admin-detail__meta">
        {isGroup ? (
          <>
            <div className="admin-detail__meta-item">
              <span className="admin-detail__meta-label">Group ID</span>
              <span className="admin-detail__meta-value">{selected.id}</span>
            </div>
            <div className="admin-detail__meta-item">
              <span className="admin-detail__meta-label">Name</span>
              <span className="admin-detail__meta-value">{selected.name}</span>
            </div>
            {selected.lat != null && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Center Lat</span>
                <span className="admin-detail__meta-value">{selected.lat}</span>
              </div>
            )}
            {selected.lng != null && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Center Lng</span>
                <span className="admin-detail__meta-value">{selected.lng}</span>
              </div>
            )}
            {selected.radius != null && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Radius</span>
                <span className="admin-detail__meta-value">{selected.radius}m</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="admin-detail__meta-item">
              <span className="admin-detail__meta-label">Location ID</span>
              <span className="admin-detail__meta-value">{selected.id}</span>
            </div>
            <div className="admin-detail__meta-item">
              <span className="admin-detail__meta-label">Name</span>
              <span className="admin-detail__meta-value">{selected.name}</span>
            </div>
            {selected.floorLabel && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Floor</span>
                <span className="admin-detail__meta-value">{selected.floorLabel}</span>
              </div>
            )}
            {selected.sublocationLabel && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Sublocation</span>
                <span className="admin-detail__meta-value">{selected.sublocationLabel}</span>
              </div>
            )}
            {selected.lat != null && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Latitude</span>
                <span className="admin-detail__meta-value">{selected.lat}</span>
              </div>
            )}
            {selected.lng != null && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Longitude</span>
                <span className="admin-detail__meta-value">{selected.lng}</span>
              </div>
            )}
            {selected.parentName && (
              <div className="admin-detail__meta-item">
                <span className="admin-detail__meta-label">Parent Group</span>
                <span className="admin-detail__meta-value">{selected.parentName}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Child locations (groups only) */}
      {isGroup && (
        <>
          <h3 className="admin-detail__section-title">
            Child Study Locations
            {childLoading && ' (loading...)'}
          </h3>
          {childLocations.length > 0 ? (
            <ul className="admin-detail__child-list">
              {childLocations.map((child) => (
                <li key={child.studyLocationId}>
                  <button
                    type="button"
                    className="admin-detail__child-item"
                    onClick={() => handleChildClick(child)}
                  >
                    {child.name}
                    {child.floorLabel ? ` - ${child.floorLabel}` : ''}
                    {child.sublocationLabel ? ` (${child.sublocationLabel})` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !childLoading && <p className="admin-detail__inline-empty">No child locations</p>
          )}
        </>
      )}

      {/* Active reports */}
      <div className="admin-detail__reports-header">
        <h3 className="admin-detail__section-title">Active Reports</h3>
        <div className="admin-detail__reports-search">
          <input
            type="search"
            placeholder="Filter reports..."
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            aria-label="Filter reports"
          />
        </div>
      </div>

      <AdminReportTable
        groupId={isGroup ? selected.id : undefined}
        locationId={!isGroup ? selected.id : undefined}
        searchQuery={debouncedReportSearch}
        refreshKey={reportRefreshKey}
      />
    </div>
  );
}

export default AdminLocationDetail;
