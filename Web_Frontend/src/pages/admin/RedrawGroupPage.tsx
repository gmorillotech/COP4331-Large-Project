import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';
import PolygonEditor, { pointInPolygon } from '../../components/admin/PolygonEditor.tsx';
import '../../components/admin/RedrawMerge.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

type Vertex = { latitude: number; longitude: number };

type LocationGroup = {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
  shapeType?: string;
  radius?: number;
  polygon?: Vertex[];
};

type ChildLocation = {
  _id: string;
  latitude: number;
  longitude: number;
  name?: string;
};

function RedrawGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<LocationGroup | null>(null);
  const [childLocations, setChildLocations] = useState<Vertex[]>([]);
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isActive = true;
    const token = localStorage.getItem('token');

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const groupsRes = await fetch('/api/locations/groups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const groupsData = await groupsRes.json();

        if (!isActive) return;

        const allGroups: LocationGroup[] = Array.isArray(groupsData)
          ? groupsData
          : groupsData.groups ?? [];
        const targetGroup = allGroups.find((g) => g._id === groupId);

        if (!targetGroup) {
          setError('Group not found.');
          setIsLoading(false);
          return;
        }

        setGroup(targetGroup);

        if (targetGroup.polygon && targetGroup.polygon.length >= 3) {
          setVertices(targetGroup.polygon);
        } else {
          const lat = targetGroup.latitude;
          const lng = targetGroup.longitude;
          const offset = 0.001;
          setVertices([
            { latitude: lat + offset, longitude: lng - offset },
            { latitude: lat + offset, longitude: lng + offset },
            { latitude: lat - offset, longitude: lng + offset },
            { latitude: lat - offset, longitude: lng - offset },
          ]);
        }

        const childRes = await fetch(
          `/api/locations/groups/${groupId}/locations`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const childData = await childRes.json();

        if (!isActive) return;

        const children: ChildLocation[] = Array.isArray(childData)
          ? childData
          : childData.locations ?? [];
        setChildLocations(
          children.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
        );
      } catch (err) {
        if (!isActive) return;
        setError(
          err instanceof Error ? err.message : 'Could not load group data.',
        );
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void fetchData();
    return () => {
      isActive = false;
    };
  }, [groupId]);

  const hasEnoughVertices = vertices.length >= 3;
  const allChildrenInside =
    hasEnoughVertices &&
    childLocations.every((child) => pointInPolygon(child, vertices));
  const isValid = hasEnoughVertices && allChildrenInside;

  async function handleSave() {
    if (!isValid || !groupId) return;

    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/admin/location-groups/${groupId}/shape`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            shapeType: 'polygon',
            polygon: vertices,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save shape.');
        return;
      }

      navigate('/admin/locations');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reach the server.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="redraw-loading">Loading group data...</div>;
  }

  const mapCenter = group
    ? { lat: group.latitude, lng: group.longitude }
    : DEFAULT_CENTER;

  return (
    <div className="redraw-page">
      <div className="redraw-topbar">
        <h1 className="redraw-topbar__title">
          Redraw: {group?.name ?? 'Unknown Group'}
        </h1>
        <div className="redraw-topbar__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/admin/locations')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="redraw-map-container">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={mapCenter}
            defaultZoom={DEFAULT_ZOOM + 1}
            mapId={MAP_ID}
            clickableIcons={false}
            disableDefaultUI={false}
            style={{ width: '100%', height: '100%' }}
          >
            <PolygonEditor
              vertices={vertices}
              onChange={setVertices}
              childLocations={childLocations}
            />
          </Map>
        </APIProvider>
      </div>

      {error && <div className="redraw-error">{error}</div>}
    </div>
  );
}

export default RedrawGroupPage;
