import { useEffect, useMemo, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { polygonFromCircle, polygonsAdjacent } from '../../lib/adminGeometry.ts';

type Vertex = { latitude: number; longitude: number };

export type BoundaryGroup = {
  locationGroupId: string;
  name: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  shapeType?: string;
  radiusMeters?: number | null;
  polygon?: Vertex[];
};

type GroupBoundaryOverlayProps = {
  groups: BoundaryGroup[];
  activeGroupId?: string;
};

const FILL_PALETTE = [
  '#53b7df',
  '#5eded6',
  '#001ad2',
  '#df53da',
];

function groupToPolygon(group: BoundaryGroup): Vertex[] | null {
  if (group.shapeType === 'polygon' && (group.polygon?.length ?? 0) >= 3) {
    return group.polygon!;
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

function greedyFourColor(groups: BoundaryGroup[]): Map<string, number> {
  const polys = groups.map((g) => ({ id: g.locationGroupId, poly: groupToPolygon(g) }));

  // Build adjacency lists
  const adj = new Map<string, Set<string>>();
  for (const g of groups) adj.set(g.locationGroupId, new Set());

  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (!polys[i].poly || !polys[j].poly) continue;
      if (polygonsAdjacent(polys[i].poly, polys[j].poly)) {
        adj.get(polys[i].id)!.add(polys[j].id);
        adj.get(polys[j].id)!.add(polys[i].id);
      }
    }
  }

  // Greedy coloring
  const colorMap = new Map<string, number>();
  for (const g of groups) {
    const neighborColors = new Set<number>();
    for (const nid of adj.get(g.locationGroupId) ?? []) {
      if (colorMap.has(nid)) neighborColors.add(colorMap.get(nid)!);
    }
    let color = 0;
    while (neighborColors.has(color)) color++;
    colorMap.set(g.locationGroupId, color);
  }

  return colorMap;
}

export default function GroupBoundaryOverlays({ groups, activeGroupId }: GroupBoundaryOverlayProps) {
  const map = useMap();
  const overlaysRef = useRef<Array<google.maps.Polygon | google.maps.Circle>>([]);

  const colorMap = useMemo(() => greedyFourColor(groups), [groups]);

  useEffect(() => {
    if (!map) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    for (const group of groups) {
      const isActive = group.locationGroupId === activeGroupId;
      const paletteIndex = colorMap.get(group.locationGroupId) ?? 0;
      const fillColor = isActive ? '#f59e0b' : FILL_PALETTE[paletteIndex % FILL_PALETTE.length];
      const strokeColor = isActive ? '#f59e0b' : fillColor;

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
          strokeOpacity: isActive ? 0.9 : 0.7,
          strokeWeight: isActive ? 3 : 2,
          fillColor,
          fillOpacity: isActive ? 0.15 : 0.18,
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
          strokeOpacity: isActive ? 0.9 : 0.7,
          strokeWeight: isActive ? 3 : 2,
          fillColor,
          fillOpacity: isActive ? 0.15 : 0.18,
          zIndex: isActive ? 2 : 1,
        });
        overlaysRef.current.push(circle);
      }
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, groups, activeGroupId, colorMap]);

  return null;
}
