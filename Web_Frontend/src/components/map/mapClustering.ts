// mapClustering — distance-based greedy clustering for group markers.
//
// At low zoom levels, nearby group markers are collapsed into a single
// cluster marker with a "+N" count badge.  Clicking a cluster zooms in
// until the members separate.

import type { MapLocation } from '../../types/mapAnnotations';

// ---- Types ------------------------------------------------------------------

export type StandaloneMarker = {
  type: 'standalone';
  location: MapLocation;
};

export type ClusterMarker = {
  type: 'cluster';
  id: string;
  lat: number;
  lng: number;
  members: MapLocation[];
  representative: MapLocation;
};

export type MarkerOrCluster = StandaloneMarker | ClusterMarker;

// ---- Helpers ----------------------------------------------------------------

/** Screen-pixel distance threshold — markers closer than this merge. */
const CLUSTER_RADIUS_PX = 60;

/** Absolute max zoom to try when unclustering (Google Maps caps around 21). */
const MAX_UNCLUSTER_ZOOM = 21;

type Pixel = { x: number; y: number };

function toPixel(
  lat: number,
  lng: number,
  zoom: number,
  projection: google.maps.Projection,
): Pixel | null {
  const point = projection.fromLatLngToPoint(
    new google.maps.LatLng(lat, lng),
  );
  if (!point) return null;
  const scale = 1 << Math.round(zoom);
  return { x: point.x * scale, y: point.y * scale };
}

function pixelDist(a: Pixel, b: Pixel): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Pick the representative: lowest noiseBand, falling back to first member. */
function pickRepresentative(members: MapLocation[]): MapLocation {
  let best = members[0];
  for (const m of members) {
    if (m.noiseBand != null && (best.noiseBand == null || m.noiseBand < best.noiseBand)) {
      best = m;
    }
  }
  return best;
}

// ---- Public API -------------------------------------------------------------

/**
 * Groups nearby markers into clusters based on pixel distance at the current
 * zoom level.  Returns a mix of standalone and cluster entries.
 */
export function clusterGroups(
  groups: MapLocation[],
  zoom: number,
  projection: google.maps.Projection,
): MarkerOrCluster[] {
  // Project all groups to screen pixels
  const pixels: (Pixel | null)[] = groups.map((g) =>
    toPixel(g.lat, g.lng, zoom, projection),
  );

  const consumed = new Set<number>();
  const results: MarkerOrCluster[] = [];
  let clusterId = 0;

  for (let i = 0; i < groups.length; i++) {
    if (consumed.has(i)) continue;
    const pi = pixels[i];
    if (!pi) {
      results.push({ type: 'standalone', location: groups[i] });
      consumed.add(i);
      continue;
    }

    // Collect all unconsumed neighbours within the radius
    const neighbours: number[] = [];
    for (let j = i + 1; j < groups.length; j++) {
      if (consumed.has(j)) continue;
      const pj = pixels[j];
      if (!pj) continue;
      if (pixelDist(pi, pj) < CLUSTER_RADIUS_PX) {
        neighbours.push(j);
      }
    }

    if (neighbours.length === 0) {
      results.push({ type: 'standalone', location: groups[i] });
    } else {
      const memberIndices = [i, ...neighbours];
      const members = memberIndices.map((idx) => groups[idx]);
      const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
      const lng = members.reduce((s, m) => s + m.lng, 0) / members.length;

      results.push({
        type: 'cluster',
        id: `cluster-${clusterId++}`,
        lat,
        lng,
        members,
        representative: pickRepresentative(members),
      });

      for (const idx of memberIndices) consumed.add(idx);
    }
  }

  return results;
}

/**
 * Finds the minimum zoom level at which all cluster members separate
 * (pairwise pixel distance > CLUSTER_RADIUS_PX).  Steps by 0.5 from
 * currentZoom + 1, capped at MAX_UNCLUSTER_ZOOM.
 */
export function calcUnclusterZoom(
  members: MapLocation[],
  projection: google.maps.Projection,
  currentZoom: number,
): number {
  for (let z = currentZoom + 1; z <= MAX_UNCLUSTER_ZOOM; z += 0.5) {
    const pts = members.map((m) => toPixel(m.lat, m.lng, z, projection));
    let allSeparated = true;

    outer: for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        if (!a || !b || pixelDist(a, b) < CLUSTER_RADIUS_PX) {
          allSeparated = false;
          break outer;
        }
      }
    }

    if (allSeparated) return z;
  }

  return MAX_UNCLUSTER_ZOOM;
}
