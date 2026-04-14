import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { apiUrl } from '../../config';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';
import {
  openPolygon,
  pointInPolygon,
  polygonFromCircle,
  subtractPolygon,
  validateSplitLineClient,
  buildChildPolygonsFromSplit,
} from '../../lib/adminGeometry.ts';
import PolygonEditor from '../../components/admin/PolygonEditor.tsx';
import SplitLineEditor from '../../components/admin/SplitLineEditor.tsx';
import GroupBoundaryOverlays from '../../components/admin/GroupBoundaryOverlays.tsx';
import { ADMIN_GEOMETRY_TUNING } from '../../config/uiTuning.ts';
import '../../components/admin/RedrawMerge.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_MAX_RADIUS_METERS = ADMIN_GEOMETRY_TUNING.defaultMaxRadiusMeters;

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

// ── Helper: convert group boundary to polygon vertices ────────────────
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
      ADMIN_GEOMETRY_TUNING.previewCirclePolygonSegments,
    );
  }

  return null;
}

// ── Helper: build default polygon for a group that has no polygon yet ─
function buildDefaultRedrawPolygon(
  targetGroup: LocationGroup,
  allGroups: LocationGroup[],
): Vertex[] {
  const centerLatitude = targetGroup.centerLatitude ?? DEFAULT_CENTER.lat;
  const centerLongitude = targetGroup.centerLongitude ?? DEFAULT_CENTER.lng;
  const cappedRadius = Math.min(
    targetGroup.radiusMeters ?? DEFAULT_MAX_RADIUS_METERS,
    DEFAULT_MAX_RADIUS_METERS,
  );

  let workingPolygon = polygonFromCircle(
    { latitude: centerLatitude, longitude: centerLongitude },
    cappedRadius,
    ADMIN_GEOMETRY_TUNING.workingCirclePolygonSegments,
  );

  for (const group of allGroups) {
    if (group.locationGroupId === targetGroup.locationGroupId) continue;

    const otherBoundary = groupBoundaryToPolygon(group);
    if (!otherBoundary) continue;

    const cutOut = subtractPolygon(workingPolygon, otherBoundary);
    if (cutOut && cutOut.length >= 4) {
      workingPolygon = openPolygon(cutOut);
    }
  }

  return workingPolygon;
}


// ── SplitGroupPage ────────────────────────────────────────────────────
function SplitGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<LocationGroup | null>(null);
  const [allGroups, setAllGroups] = useState<LocationGroup[]>([]);
  const [childLocations, setChildLocations] = useState<Vertex[]>([]);
  const [parentVertices, setParentVertices] = useState<Vertex[]>([]);
  const [splitLine, setSplitLine] = useState<Vertex[]>([]);
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [phase, setPhase] = useState<'boundary' | 'split'>('split');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────
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

        const fetchedGroups: LocationGroup[] = Array.isArray(groupsData)
          ? groupsData
          : groupsData.groups ?? [];
        setAllGroups(fetchedGroups);

        const targetGroup = fetchedGroups.find(
          (g) => g.locationGroupId === groupId,
        );

        if (!targetGroup) {
          setError('Group not found.');
          setIsLoading(false);
          return;
        }

        setGroup(targetGroup);

        // Seed parent polygon vertices
        if (targetGroup.polygon && targetGroup.polygon.length >= 3) {
          setParentVertices(openPolygon(targetGroup.polygon));
        } else {
          setParentVertices(buildDefaultRedrawPolygon(targetGroup, fetchedGroups));
        }

        // Pre-populate child group names
        setNameA(`${targetGroup.name} A`);
        setNameB(`${targetGroup.name} B`);

        // Fetch child locations
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

  const snapPolygons = useMemo(() => {
    const result: Vertex[][] = [];
    for (const g of allGroups) {
      if (g.locationGroupId === groupId) continue;
      const poly = groupBoundaryToPolygon(g);
      if (poly && poly.length >= 3) result.push(poly);
    }
    return result;
  }, [allGroups, groupId]);

  // ── Computed values ─────────────────────────────────────────────────
  const splitValidation = validateSplitLineClient(splitLine, parentVertices);
  const childPolygons = splitValidation.valid
    ? buildChildPolygonsFromSplit(parentVertices, splitLine)
    : null;
  const childA = childPolygons?.[0] ?? null;
  const childB = childPolygons?.[1] ?? null;

  const isValid =
    splitValidation.valid &&
    childA !== null &&
    childB !== null &&
    nameA.trim().length > 0 &&
    nameB.trim().length > 0 &&
    nameA.trim() !== nameB.trim();

  // ── Save handler ────────────────────────────────────────────────────
  async function handleSave() {
    if (!isValid || !groupId) return;

    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        apiUrl(`/api/admin/location-groups/${groupId}/split`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            parentPolygon: parentVertices,
            splitLine,
            destinationGroups: [
              { name: nameA.trim() },
              { name: nameB.trim() },
            ],
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.error ??
          (Array.isArray(data.errors) ? data.errors.join('; ') : null) ??
          'Failed to save split.';
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

  // ── Loading state ───────────────────────────────────────────────────
  if (isLoading) {
    return <div className="split-loading">Loading group data…</div>;
  }

  const mapCenter =
    group && group.centerLatitude != null && group.centerLongitude != null
      ? { lat: group.centerLatitude, lng: group.centerLongitude }
      : DEFAULT_CENTER;

  return (
    <div className="split-page">
      {/* Top bar */}
      <div className="split-topbar">
        <div className="split-topbar__heading">
          <p className="split-topbar__eyebrow">Split group</p>
          <h1 className="split-topbar__title">
            Split: {group?.name ?? 'Unknown Group'}
          </h1>
        </div>
        <div className="split-topbar__actions">
          <div className="split-phase-toggle" role="tablist" aria-label="Edit mode">
            <button
              type="button"
              role="tab"
              aria-selected={phase === 'boundary'}
              className={`split-phase-btn${phase === 'boundary' ? ' is-active' : ''}`}
              onClick={() => {
                setPhase('boundary');
                setSplitLine([]);
              }}
            >
              Edit Boundary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={phase === 'split'}
              className={`split-phase-btn${phase === 'split' ? ' is-active' : ''}`}
              onClick={() => setPhase('split')}
            >
              Draw Split Line
            </button>
          </div>
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
            {isSaving ? 'Saving...' : 'Save Split'}
          </button>
        </div>
      </div>

      {/* Names panel — floating bottom-left */}
      <div className="split-names-panel">
        <div className="split-names-panel__group">
          <label className="split-names-panel__label">Group A Name</label>
          <input
            className="split-names-panel__input"
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            placeholder="Name for group A..."
          />
          {childA && (
            <span className="split-names-panel__count">
              {childLocations.filter((p) => pointInPolygon(p, openPolygon(childA))).length}{' '}
              locations
            </span>
          )}
        </div>
        <div className="split-names-panel__group">
          <label className="split-names-panel__label">Group B Name</label>
          <input
            className="split-names-panel__input"
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
            placeholder="Name for group B..."
          />
          {childB && (
            <span className="split-names-panel__count">
              {childLocations.filter((p) => pointInPolygon(p, openPolygon(childB))).length}{' '}
              locations
            </span>
          )}
        </div>
        {splitLine.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSplitLine([])}
          >
            Reset Split Line
          </button>
        )}
      </div>

      {/* Map */}
      <div className="split-map-container">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={mapCenter}
            defaultZoom={DEFAULT_ZOOM + 1}
            mapId={MAP_ID}
            colorScheme="LIGHT"
            clickableIcons={false}
            disableDefaultUI={false}
            style={{ width: '100%', height: '100%' }}
          >
            <GroupBoundaryOverlays groups={allGroups} activeGroupId={groupId} />
            {phase === 'boundary' ? (
              <PolygonEditor
                vertices={parentVertices}
                onChange={setParentVertices}
                childLocations={childLocations}
                snapPolygons={snapPolygons}
              />
            ) : (
              <SplitLineEditor
                parentVertices={parentVertices}
                splitLine={splitLine}
                onSplitLineChange={setSplitLine}
                childLocations={childLocations}
                childA={childA}
                childB={childB}
              />
            )}
          </Map>
        </APIProvider>
      </div>

      {error && <div className="split-error">{error}</div>}
    </div>
  );
}

export default SplitGroupPage;
