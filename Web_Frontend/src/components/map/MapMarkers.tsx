// MapMarkers — places pins on the map with zoom-based visibility.
//
// Architecture: group pins and sub-location pins are two fully independent
// marker systems. They share no state, no props, and no AdvancedMarker
// instance — each has its own filtered array and its own render helper
// (renderGroupMarkers / renderSubLocationMarkers). The only thing that
// switches between them is conditional rendering driven by zoom level:
//
//   zoom <  ZOOM_THRESHOLD           → only renderGroupMarkers() runs
//   zoom >= ZOOM_THRESHOLD           → only renderSubLocationMarkers() runs
//   (special: forceGroups keeps groups visible briefly during cluster expand)
//
// A group pin NEVER mutates into a sub-location pin. When zoom crosses the
// threshold, the group markers unmount and the sub-location markers mount —
// different React keys, different components in <AdvancedMarker>, different
// click handlers, different data.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { formatLocationHeading } from '../../lib/mapUtils.ts';
import type { AnimationState } from './mapMarkerAnimation.ts';
import { clusterGroups, calcUnclusterZoom } from './mapClustering.ts';
import type { ClusterMarker } from './mapClustering.ts';
import MapMarkerVisual, { ClusterMarkerVisual } from './MapMarkerVisual.tsx';

export const ZOOM_THRESHOLD = 17;

// ---- Camera controller -------------------------------------------------------

function MapCameraController({
  selectedId,
  selectedGroupId,
  locations,
}: {
  selectedId: string | null;
  selectedGroupId: string | null;
  locations: MapLocation[];
}) {
  const map = useMap();

  // Pan / zoom to the focused group whenever selectedGroupId changes. This is
  // what makes sidebar group clicks focus the map (the previous version only
  // reacted to selectedId, which was never set for sidebar group picks).
  useEffect(() => {
    if (!map || !selectedGroupId) return;
    const group = locations.find((l) => l.id === selectedGroupId && l.kind === 'group');
    if (!group) return;
    map.panTo({ lat: group.lat, lng: group.lng });
    if ((map.getZoom() ?? 0) < ZOOM_THRESHOLD) {
      map.setZoom(ZOOM_THRESHOLD);
    }
  }, [map, selectedGroupId, locations]);

  // Pan / zoom to a selected sub-location popup. Groups don't go through this
  // branch anymore — their camera move is handled by the selectedGroupId
  // effect above.
  useEffect(() => {
    if (!map || !selectedId) return;
    const target = locations.find((l) => l.id === selectedId);
    if (!target || target.kind === 'group') return;
    map.panTo({ lat: target.lat, lng: target.lng });
    if ((map.getZoom() ?? 0) < ZOOM_THRESHOLD) {
      map.setZoom(ZOOM_THRESHOLD);
    }
  }, [map, selectedId, locations]);

  return null;
}

// ---- Main component ---------------------------------------------------------

type MapMarkersProps = {
  locations: MapLocation[];
  selectedId: string | null;
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  onZoomChange: (zoom: number) => void;
  animation: AnimationState;
};

function MapMarkers({
  locations,
  selectedId,
  selectedGroupId,
  onSelect,
  onZoomChange,
  animation,
}: MapMarkersProps) {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(0);

  // When a cluster click zooms past the threshold, forceGroups keeps group
  // markers visible until the user's next map interaction.
  const [forceGroups, setForceGroups] = useState(false);
  const forceCleanupRef = useRef<(() => void) | null>(null);

  // Clean up force-groups listeners on unmount
  useEffect(() => {
    return () => forceCleanupRef.current?.();
  }, []);

  // Track zoom changes and notify parent
  useEffect(() => {
    if (!map) return;
    const initial = map.getZoom() ?? 0;
    setZoom(initial);
    onZoomChange(initial);
    const listener = map.addListener('zoom_changed', () => {
      const z = map.getZoom() ?? 0;
      setZoom(z);
      onZoomChange(z);
    });
    return () => listener.remove();
  }, [map, onZoomChange]);

  const isZoomedIn = zoom >= ZOOM_THRESHOLD;
  const showGroups = !isZoomedIn || forceGroups;

  const groups = useMemo(
    () => locations.filter((l) => l.kind === 'group'),
    [locations],
  );
  const locationMarkers = useMemo(() => {
    // Defensive de-dup by studyLocationId so every sub-location gets exactly
    // one AdvancedMarker. If the API ever returns the same id twice, React
    // would silently render only the first (second fails the unique-key
    // invariant), producing "missing pins". This guarantees 1 sub-location =
    // 1 pin regardless of API hiccups.
    const seen = new Set<string>();
    const result: MapLocation[] = [];
    for (const loc of locations) {
      if (loc.kind === 'group') continue;
      if (seen.has(loc.id)) continue;
      seen.add(loc.id);
      result.push(loc);
    }
    return result;
  }, [locations]);

  const handleGroupClick = useCallback(
    (groupId: string) => {
      // Group pin click ONLY opens the group popup. No camera move, no zoom,
      // no sub-location reveal. To reveal sub-location pins, the user clicks
      // the group popup card itself (which fires onRevealGroupLocations in
      // MapExplorer → sets selectedGroupId → MapCameraController zooms in →
      // visibleLocations filter returns that group's sub-locations).
      onSelect(groupId);
    },
    [onSelect],
  );

  const handleClusterClick = useCallback(
    (cluster: ClusterMarker) => {
      if (!map) return;
      const projection = map.getProjection();
      if (!projection) return;

      // Clean up any previous force-groups listeners
      forceCleanupRef.current?.();
      forceCleanupRef.current = null;

      const targetZoom = calcUnclusterZoom(cluster.members, projection, zoom);

      if (targetZoom >= ZOOM_THRESHOLD) {
        // The uncluster zoom crosses the threshold — force group pins to stay
        // visible until the user's next map interaction.
        setForceGroups(true);

        const idleListener = map.addListener('idle', () => {
          idleListener.remove();

          const clearForce = () => {
            setForceGroups(false);
            cleanup();
          };

          const listeners = [
            map.addListener('dragstart', clearForce),
            map.addListener('zoom_changed', clearForce),
            map.addListener('click', clearForce),
          ];

          const cleanup = () => {
            listeners.forEach((l) => l.remove());
            forceCleanupRef.current = null;
          };

          forceCleanupRef.current = cleanup;
        });
      }

      map.panTo({ lat: cluster.lat, lng: cluster.lng });
      map.setZoom(targetZoom);
    },
    [map, zoom],
  );

  // Cluster nearby groups at the current zoom level.
  // When forceGroups is active (cluster expanded past threshold), show all
  // group members individually — skip clustering so the expanded pins stay.
  const clusteredGroups = useMemo(() => {
    if (!showGroups || groups.length === 0) return [];
    if (forceGroups) {
      return groups.map((g) => ({ type: 'standalone' as const, location: g }));
    }
    const projection = map?.getProjection() ?? null;
    if (!projection) {
      return groups.map((g) => ({ type: 'standalone' as const, location: g }));
    }
    return clusterGroups(groups, zoom, projection);
  }, [groups, zoom, showGroups, forceGroups, map]);

  // Sub-location visibility. Zoom is the primary gate:
  //   • Zoomed out or during the force-groups grace period → nothing.
  //   • Zoomed in with no group in focus → every sub-location pin renders
  //     (manual pinch-zoom still exposes everything, preserving free
  //     exploration).
  //   • Zoomed in with selectedGroupId set (user clicked a group popup or
  //     sidebar group) → only that group's sub-location pins render — the
  //     "reveal all sub-location pins for that group" behavior.
  const visibleLocations = (() => {
    if (!isZoomedIn || forceGroups) return [];
    if (selectedGroupId) {
      return locationMarkers.filter((l) => l.locationGroupId === selectedGroupId);
    }
    return locationMarkers;
  })();

  // ── Group render path ────────────────────────────────────────────────────
  // Consumes `clusteredGroups` only. Uses `handleGroupClick` (pan+zoom) on
  // standalone groups and `handleClusterClick` on clusters. Never touches
  // `locationMarkers`, `visibleLocations`, or `onSelect` directly — so group
  // markers cannot adopt sub-location behavior.
  function renderGroupMarkers() {
    if (!showGroups) return null;
    return clusteredGroups.map((item) => {
      if (item.type === 'cluster') {
        return (
          <AdvancedMarker
            key={`group-cluster-${item.id}`}
            position={{ lat: item.lat, lng: item.lng }}
            title={`${item.members.length} buildings`}
            zIndex={30}
            onClick={() => handleClusterClick(item)}
          >
            <ClusterMarkerVisual
              cluster={item}
              isSelected={false}
              animation={animation}
              zoom={zoom}
            />
          </AdvancedMarker>
        );
      }
      const isSelected = item.location.id === selectedId;
      return (
        <AdvancedMarker
          key={`group-${item.location.id}`}
          position={{ lat: item.location.lat, lng: item.location.lng }}
          title={item.location.title}
          zIndex={isSelected ? 100 : 20}
          onClick={() => handleGroupClick(item.location.id)}
        >
          <MapMarkerVisual
            location={item.location}
            isSelected={isSelected}
            animation={animation}
            zoom={zoom}
          />
        </AdvancedMarker>
      );
    });
  }

  // ── Sub-location render path ─────────────────────────────────────────────
  // Consumes `visibleLocations` only — already filtered to kind !== 'group'
  // and zoom-gated. Each sub-location pin is its own AdvancedMarker with its
  // own key prefixed "subloc-" to guarantee no key collision with a group
  // that happens to share an id namespace. Uses `onSelect` directly (no
  // pan-zoom behavior) so a click opens the location popup immediately.
  function renderSubLocationMarkers() {
    if (visibleLocations.length === 0) return null;
    return visibleLocations.map((location) => {
      const isSelected = location.id === selectedId;
      return (
        <AdvancedMarker
          key={`subloc-${location.id}`}
          position={{ lat: location.lat, lng: location.lng }}
          title={formatLocationHeading(location)}
          zIndex={isSelected ? 100 : 5}
          onClick={() => onSelect(location.id)}
        >
          <MapMarkerVisual
            location={location}
            isSelected={isSelected}
            animation={animation}
            zoom={zoom}
          />
        </AdvancedMarker>
      );
    });
  }

  return (
    <>
      <MapCameraController
        selectedId={selectedId}
        selectedGroupId={selectedGroupId}
        locations={locations}
      />
      {renderGroupMarkers()}
      {renderSubLocationMarkers()}
    </>
  );
}

export default MapMarkers;
