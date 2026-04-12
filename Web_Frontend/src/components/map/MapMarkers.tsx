// MapMarkers — places pins on the map with zoom-based visibility.
//
// At low zoom: only group markers are visible.
// At high zoom (>= ZOOM_THRESHOLD): only location markers are visible.
// Clicking a group marker zooms in to reveal its child locations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { formatLocationHeading } from '../../lib/mapUtils.ts';
import type { AnimationState } from './mapMarkerAnimation.ts';
import { clusterGroups, calcUnclusterZoom } from './mapClustering.ts';
import type { ClusterMarker } from './mapClustering.ts';
import MapMarkerVisual, { ClusterMarkerVisual } from './MapMarkerVisual.tsx';
import { MAP_UI_TUNING } from '../../config/uiTuning.ts';

export const ZOOM_THRESHOLD = MAP_UI_TUNING.locationZoomThreshold;

// ---- Camera controller -------------------------------------------------------

function MapCameraController({
  selectedId,
  locations,
}: {
  selectedId: string | null;
  locations: MapLocation[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedId) return;
    const target = locations.find((l) => l.id === selectedId);
    if (!target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    if (target.kind !== 'group' && (map.getZoom() ?? 0) < ZOOM_THRESHOLD) {
      map.setZoom(ZOOM_THRESHOLD);
    }
  }, [map, selectedId, locations]);

  return null;
}

// ---- Main component ---------------------------------------------------------

type MapMarkersProps = {
  locations: MapLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onZoomChange: (zoom: number) => void;
  animation: AnimationState;
};

function MapMarkers({ locations, selectedId, onSelect, onZoomChange, animation }: MapMarkersProps) {
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
  const locationMarkers = useMemo(
    () => locations.filter((l) => l.kind !== 'group'),
    [locations],
  );

  const handleGroupClick = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (group && map) {
        map.panTo({ lat: group.lat, lng: group.lng });
        map.setZoom(ZOOM_THRESHOLD);
      }
      onSelect(groupId);
    },
    [groups, map, onSelect],
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

  const visibleLocations = (isZoomedIn && !forceGroups) ? locationMarkers : [];

  return (
    <>
      <MapCameraController selectedId={selectedId} locations={locations} />

      {clusteredGroups.map((item) => {
        if (item.type === 'cluster') {
          return (
            <AdvancedMarker
              key={item.id}
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
            key={item.location.id}
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
      })}

      {visibleLocations.map((location) => {
        const isSelected = location.id === selectedId;
        return (
          <AdvancedMarker
            key={location.id}
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
      })}
    </>
  );
}

export default MapMarkers;
