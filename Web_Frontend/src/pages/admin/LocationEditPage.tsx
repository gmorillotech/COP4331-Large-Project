import { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';
import GroupSelector from '../../components/admin/GroupSelector.tsx';
import MergeDialog from '../../components/admin/MergeDialog.tsx';
import '../../components/admin/RedrawMerge.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

type LocationGroup = {
  locationGroupId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
};

function LocationEditPage() {
  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMerge, setShowMerge] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const token = localStorage.getItem('token');

    async function fetchGroups() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/locations/groups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!isActive) return;

        const allGroups: LocationGroup[] = Array.isArray(data)
          ? data
          : data.groups ?? [];
        setGroups(allGroups);
      } catch (err) {
        if (!isActive) return;
        setError(
          err instanceof Error ? err.message : 'Could not load groups.',
        );
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void fetchGroups();
    return () => {
      isActive = false;
    };
  }, []);

  function handleToggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  const selectedGroups = selectedIds
    .map((id) => groups.find((g) => g.locationGroupId === id))
    .filter((g): g is LocationGroup => g != null);

  return (
    <div className="location-edit-page">
      <div className="location-edit-sidebar">
        <div className="location-edit-sidebar__header">
          <h2>Location Groups</h2>
          <p className="location-edit-sidebar__selection-count">
            {selectedIds.length}/2 groups selected
          </p>
        </div>

        <div className="location-edit-sidebar__body">
          {isLoading && (
            <p style={{ padding: '20px', color: '#666' }}>Loading groups...</p>
          )}
          {error && (
            <p style={{ padding: '20px', color: '#c62828' }}>{error}</p>
          )}
          {!isLoading && !error && (
            <GroupSelector
              groups={groups}
              selectedIds={selectedIds}
              onToggle={handleToggle}
            />
          )}
        </div>

        <div className="location-edit-sidebar__footer">
          {selectedGroups.length > 0 && (
            <div className="location-edit-sidebar__selected-names">
              Selected: {selectedGroups.map((g) => g.name).join(', ')}
            </div>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={selectedIds.length !== 2}
            onClick={() => setShowMerge(true)}
            style={{ width: '100%' }}
          >
            Merge Groups
          </button>
        </div>
      </div>

      <div className="location-edit-map">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            mapId={MAP_ID}
            clickableIcons={false}
            disableDefaultUI={true}
            style={{ width: '100%', height: '100%' }}
          >
            {groups.filter((g) => g.centerLatitude != null && g.centerLongitude != null).map((group) => {
              const isSelected = selectedIds.includes(group.locationGroupId);
              return (
                <AdvancedMarker
                  key={group.locationGroupId}
                  position={{ lat: group.centerLatitude, lng: group.centerLongitude }}
                  title={group.name}
                  zIndex={isSelected ? 100 : 10}
                  onClick={() => handleToggle(group.locationGroupId)}
                >
                  <div
                    className={`group-map-pin${isSelected ? ' is-selected' : ''}`}
                  >
                    <span className="group-map-pin__letter">
                      {group.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>
      </div>

      {showMerge && selectedGroups.length === 2 && (
        <MergeDialog
          group1={selectedGroups[0]}
          group2={selectedGroups[1]}
          onConfirm={() => {
            setShowMerge(false);
            setSelectedIds([]);
          }}
          onCancel={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}

export default LocationEditPage;
