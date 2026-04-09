import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { apiUrl } from '../../config';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';
import { openPolygon, polygonFromCircle, subtractPolygon } from '../../lib/adminGeometry.ts';
import PolygonEditor, { pointInPolygon } from '../../components/admin/PolygonEditor.tsx';
import '../../components/admin/RedrawMerge.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_MAX_RADIUS_METERS = 60;

type Vertex = { latitude: number; longitude: number };

type LocationGroup = {
  locationGroupId: string;
  name: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  shapeType?: string;
  radiusMeters?: number | null;
  polygon?: Vertex[];
};

type ChildLocation = {
  studyLocationId: string;
  latitude: number;
  longitude: number;
  name?: string;
};

function groupBoundaryToPolygon(group: LocationGroup): Vertex[] | null {
  if (group.shapeType === 'polygon' && (group.polygon?.length ?? 0) >= 3) {
    return group.polygon ?? null;
  }

  if (
    group.centerLatitude != null &&
    group.centerLongitude != null &&
    group.radiusMeters != null
  ) {
    return polygonFromCircle(
      { latitude: group.centerLatitude, longitude: group.centerLongitude },
      group.radiusMeters,
      24,
    );
  }

  return null;
}

function buildDefaultRedrawPolygon(targetGroup: LocationGroup, allGroups: LocationGroup[]): Vertex[] {
  const centerLatitude = targetGroup.centerLatitude ?? DEFAULT_CENTER.lat;
  const centerLongitude = targetGroup.centerLongitude ?? DEFAULT_CENTER.lng;
  const cappedRadius = Math.min(
    targetGroup.radiusMeters ?? DEFAULT_MAX_RADIUS_METERS,
    DEFAULT_MAX_RADIUS_METERS,
  );

  let workingPolygon = polygonFromCircle(
    { latitude: centerLatitude, longitude: centerLongitude },
    cappedRadius,
    6,
  );

  for (const group of allGroups) {
    if (group.locationGroupId === targetGroup.locationGroupId) {
      continue;
    }

    const otherBoundary = groupBoundaryToPolygon(group);
    if (!otherBoundary) {
      continue;
    }

    const cutOut = subtractPolygon(workingPolygon, otherBoundary);
    if (cutOut && cutOut.length >= 4) {
      workingPolygon = openPolygon(cutOut);
    }
  }

  return workingPolygon;
}

type GroupBoundaryOverlayProps = {
  groups: LocationGroup[];
  activeGroupId?: string;
};

function GroupBoundaryOverlays({ groups, activeGroupId }: GroupBoundaryOverlayProps) {
  const map = useMap();
  const overlaysRef = useRef<Array<google.maps.Polygon | google.maps.Circle>>([]);

  useEffect(() => {
    if (!map) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    for (const group of groups) {
      const isActive = group.locationGroupId === activeGroupId;
      const strokeColor = isActive ? '#f59e0b' : '#64748b';
      const fillColor = isActive ? '#f59e0b' : '#94a3b8';

      if (group.shapeType === 'polygon' && (group.polygon?.length ?? 0) >= 3) {
        const polygon = new google.maps.Polygon({
          map,
          paths: group.polygon!.map((vertex) => ({
            lat: vertex.latitude,
            lng: vertex.longitude,
          })),
          clickable: false,
          editable: false,
          draggable: false,
          strokeColor,
          strokeOpacity: isActive ? 0.8 : 0.55,
          strokeWeight: isActive ? 3 : 2,
          fillColor,
          fillOpacity: isActive ? 0.08 : 0.04,
          zIndex: isActive ? 2 : 1,
        });
        overlaysRef.current.push(polygon);
        continue;
      }

      if (
        group.centerLatitude != null &&
        group.centerLongitude != null &&
        group.radiusMeters != null
      ) {
        const circle = new google.maps.Circle({
          map,
          center: { lat: group.centerLatitude, lng: group.centerLongitude },
          radius: group.radiusMeters,
          clickable: false,
          strokeColor,
          strokeOpacity: isActive ? 0.8 : 0.55,
          strokeWeight: isActive ? 3 : 2,
          fillColor,
          fillOpacity: isActive ? 0.08 : 0.04,
          zIndex: isActive ? 2 : 1,
        });
        overlaysRef.current.push(circle);
      }
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, groups, activeGroupId]);

  return null;
}

function RedrawGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<LocationGroup | null>(null);
  const [allGroups, setAllGroups] = useState<LocationGroup[]>([]);
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
        const groupsRes = await fetch(apiUrl('/api/locations/groups'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const groupsData = await groupsRes.json();

        if (!isActive) return;

        const allGroups: LocationGroup[] = Array.isArray(groupsData)
          ? groupsData
          : groupsData.groups ?? [];
        setAllGroups(allGroups);
        const targetGroup = allGroups.find((g) => g.locationGroupId === groupId);

        if (!targetGroup) {
          setError('Group not found.');
          setIsLoading(false);
          return;
        }

        setGroup(targetGroup);

        if (targetGroup.polygon && targetGroup.polygon.length >= 3) {
          setVertices(openPolygon(targetGroup.polygon));
        } else {
          setVertices(buildDefaultRedrawPolygon(targetGroup, allGroups));
        }

        const childRes = await fetch(
          apiUrl(`/api/locations/groups/${groupId}/locations`),
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
        apiUrl(`/api/admin/location-groups/${groupId}/shape`),
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
        const msg = data.error
          ?? (Array.isArray(data.errors) ? data.errors.join('; ') : null)
          ?? 'Failed to save shape.';
        setError(msg);
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

  const mapCenter = group && group.centerLatitude != null && group.centerLongitude != null
    ? { lat: group.centerLatitude, lng: group.centerLongitude }
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
            <GroupBoundaryOverlays groups={allGroups} activeGroupId={groupId} />
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
