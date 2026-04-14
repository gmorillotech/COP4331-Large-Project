import { ADMIN_GEOMETRY_TUNING } from '../config/uiTuning.ts';

export type Vertex = {
  latitude: number;
  longitude: number;
};

const EPSILON = 1e-9;

function pointKey(point: Vertex): string {
  return `${point.latitude.toFixed(12)},${point.longitude.toFixed(12)}`;
}

function pointsEqual(a: Vertex, b: Vertex, epsilon = EPSILON): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon
  );
}

function dedupePoints(points: Vertex[]): Vertex[] {
  const seen = new Set<string>();
  const unique: Vertex[] = [];

  for (const point of points) {
    const key = pointKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }

  return unique;
}

export function closePolygon(vertices: Vertex[]): Vertex[] {
  if (vertices.length === 0) return [];
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return pointsEqual(first, last) ? [...vertices] : [...vertices, { ...first }];
}

export function openPolygon(vertices: Vertex[]): Vertex[] {
  if (vertices.length >= 2 && pointsEqual(vertices[0], vertices[vertices.length - 1])) {
    return vertices.slice(0, -1);
  }
  return vertices;
}

function orientation(p: Vertex, q: Vertex, r: Vertex): number {
  const value =
    (q.longitude - p.longitude) * (r.latitude - q.latitude) -
    (q.latitude - p.latitude) * (r.longitude - q.longitude);

  if (Math.abs(value) < EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(p: Vertex, q: Vertex, r: Vertex): boolean {
  return (
    q.latitude <= Math.max(p.latitude, r.latitude) + EPSILON &&
    q.latitude >= Math.min(p.latitude, r.latitude) - EPSILON &&
    q.longitude <= Math.max(p.longitude, r.longitude) + EPSILON &&
    q.longitude >= Math.min(p.longitude, r.longitude) - EPSILON
  );
}

function segmentsIntersect(p1: Vertex, q1: Vertex, p2: Vertex, q2: Vertex): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

export function pointInPolygon(point: Vertex, polygon: Vertex[]): boolean {
  const ring = closePolygon(polygon);
  if (ring.length < 4) return false;

  let inside = false;
  const edgeCount = ring.length - 1;
  for (let i = 0, j = edgeCount - 1; i < edgeCount; j = i++) {
    const xi = ring[i].latitude;
    const yi = ring[i].longitude;
    const xj = ring[j].latitude;
    const yj = ring[j].longitude;

    const intersects =
      yi > point.longitude !== yj > point.longitude &&
      point.latitude < ((xj - xi) * (point.longitude - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointOnPolygonBoundary(point: Vertex, polygon: Vertex[]): boolean {
  const ring = closePolygon(polygon);
  if (ring.length < 4) return false;

  for (let i = 0; i < ring.length - 1; i++) {
    if (orientation(ring[i], point, ring[i + 1]) === 0 && onSegment(ring[i], point, ring[i + 1])) {
      return true;
    }
  }

  return false;
}

function pointInPolygonStrict(point: Vertex, polygon: Vertex[]): boolean {
  return pointInPolygon(point, polygon) && !pointOnPolygonBoundary(point, polygon);
}

function pointInOrOnPolygon(point: Vertex, polygon: Vertex[]): boolean {
  return pointInPolygonStrict(point, polygon) || pointOnPolygonBoundary(point, polygon);
}

function lineIntersection(p1: Vertex, q1: Vertex, p2: Vertex, q2: Vertex): Vertex | null {
  const x1 = p1.latitude;
  const y1 = p1.longitude;
  const x2 = q1.latitude;
  const y2 = q1.longitude;
  const x3 = p2.latitude;
  const y3 = p2.longitude;
  const x4 = q2.latitude;
  const y4 = q2.longitude;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < EPSILON) return null;

  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;

  return {
    latitude: (det1 * (x3 - x4) - (x1 - x2) * det2) / denominator,
    longitude: (det1 * (y3 - y4) - (y1 - y2) * det2) / denominator,
  };
}

function segmentIntersectionPoints(p1: Vertex, q1: Vertex, p2: Vertex, q2: Vertex): Vertex[] {
  if (!segmentsIntersect(p1, q1, p2, q2)) return [];

  if (
    orientation(p1, q1, p2) === 0 &&
    orientation(p1, q1, q2) === 0 &&
    orientation(p2, q2, p1) === 0 &&
    orientation(p2, q2, q1) === 0
  ) {
    return dedupePoints(
      [p1, q1, p2, q2].filter((point) => onSegment(p1, point, q1) && onSegment(p2, point, q2)),
    );
  }

  const intersection = lineIntersection(p1, q1, p2, q2);
  return intersection ? [intersection] : [];
}

function projectPointT(point: Vertex, start: Vertex, end: Vertex): number {
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  if (Math.abs(dLat) >= Math.abs(dLng)) {
    return Math.abs(dLat) < EPSILON ? 0 : (point.latitude - start.latitude) / dLat;
  }

  return Math.abs(dLng) < EPSILON ? 0 : (point.longitude - start.longitude) / dLng;
}

function segmentLengthSquared(a: Vertex, b: Vertex): number {
  const dLat = a.latitude - b.latitude;
  const dLng = a.longitude - b.longitude;
  return dLat * dLat + dLng * dLng;
}

function closestPointOnSegment(point: Vertex, a: Vertex, b: Vertex): Vertex {
  const dx = b.latitude - a.latitude;
  const dy = b.longitude - a.longitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPSILON * EPSILON) return a;
  let t = ((point.latitude - a.latitude) * dx + (point.longitude - a.longitude) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + t * dx,
    longitude: a.longitude + t * dy,
  };
}

function isPointOnSegment(point: Vertex, a: Vertex, b: Vertex, epsilon = 1e-6): boolean {
  const closest = closestPointOnSegment(point, a, b);
  const dist = Math.sqrt(
    (point.latitude - closest.latitude) ** 2 +
    (point.longitude - closest.longitude) ** 2,
  );
  return dist < epsilon;
}

function midpoint(a: Vertex, b: Vertex): Vertex {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

function offsetPointAlongNormal(point: Vertex, start: Vertex, end: Vertex, direction = 1, epsilon = 1e-7): Vertex {
  const dx = end.latitude - start.latitude;
  const dy = end.longitude - start.longitude;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < EPSILON) return point;

  return {
    latitude: point.latitude + (-dy / length) * epsilon * direction,
    longitude: point.longitude + (dx / length) * epsilon * direction,
  };
}

function splitPolygonIntoSegments(sourcePolygon: Vertex[], clipPolygon: Vertex[]): Array<[Vertex, Vertex]> {
  const sourceRing = closePolygon(sourcePolygon);
  const clipRing = closePolygon(clipPolygon);
  const segments: Array<[Vertex, Vertex]> = [];

  for (let i = 0; i < sourceRing.length - 1; i++) {
    const start = sourceRing[i];
    const end = sourceRing[i + 1];
    const splitPoints = [start, end];

    for (let j = 0; j < clipRing.length - 1; j++) {
      splitPoints.push(...segmentIntersectionPoints(start, end, clipRing[j], clipRing[j + 1]));
    }

    const ordered = dedupePoints(splitPoints)
      .map((point) => ({ point, t: projectPointT(point, start, end) }))
      .sort((left, right) => left.t - right.t)
      .map(({ point }) => point);

    for (let j = 0; j < ordered.length - 1; j++) {
      if (segmentLengthSquared(ordered[j], ordered[j + 1]) <= EPSILON * EPSILON) continue;
      segments.push([ordered[j], ordered[j + 1]]);
    }
  }

  return segments;
}

function segmentMapKey(a: Vertex, b: Vertex): string {
  const keyA = pointKey(a);
  const keyB = pointKey(b);
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function simplifyPolygon(vertices: Vertex[]): Vertex[] {
  if (vertices.length < 4) return vertices;

  const simplified: Vertex[] = [vertices[0]];
  for (let i = 1; i < vertices.length - 1; i++) {
    const previous = simplified[simplified.length - 1];
    const current = vertices[i];
    const next = vertices[i + 1];
    if (orientation(previous, current, next) === 0 && onSegment(previous, current, next)) continue;
    simplified.push(current);
  }

  simplified.push(simplified[0]);
  return simplified;
}

function stitchSegmentsToPolygon(segments: Array<[Vertex, Vertex]>): Vertex[] | null {
  if (segments.length === 0) return null;

  const adjacency = new Map<string, Vertex[]>();
  for (const [a, b] of segments) {
    const keyA = pointKey(a);
    const keyB = pointKey(b);
    if (!adjacency.has(keyA)) adjacency.set(keyA, []);
    if (!adjacency.has(keyB)) adjacency.set(keyB, []);
    adjacency.get(keyA)!.push(b);
    adjacency.get(keyB)!.push(a);
  }

  for (const neighbors of adjacency.values()) {
    if (neighbors.length !== 2) return null;
  }

  const startKey = [...adjacency.keys()].sort()[0];
  const keyToPoint = new Map<string, Vertex>();
  segments.forEach(([a, b]) => {
    keyToPoint.set(pointKey(a), a);
    keyToPoint.set(pointKey(b), b);
  });

  const startPoint = keyToPoint.get(startKey)!;
  const polygon: Vertex[] = [startPoint];
  const visitedEdges = new Set<string>();
  let current = startPoint;
  let previous: Vertex | null = null;

  while (true) {
    const neighbors = adjacency.get(pointKey(current)) ?? [];
    let nextPoint: Vertex | null = null;

    for (const neighbor of neighbors) {
      const edgeKey = segmentMapKey(current, neighbor);
      if (visitedEdges.has(edgeKey)) continue;
      if (previous && pointsEqual(previous, neighbor)) continue;
      nextPoint = neighbor;
      visitedEdges.add(edgeKey);
      break;
    }

    if (!nextPoint) {
      if (!previous && neighbors[0]) {
        nextPoint = neighbors[0];
        visitedEdges.add(segmentMapKey(current, nextPoint));
      } else {
        break;
      }
    }

    polygon.push(nextPoint);
    previous = current;
    current = nextPoint;

    if (pointsEqual(current, startPoint)) break;
  }

  if (!pointsEqual(polygon[polygon.length - 1], polygon[0])) return null;
  if (visitedEdges.size !== segments.length) return null;

  return simplifyPolygon(polygon);
}

function pointInDifference(point: Vertex, subject: Vertex[], clip: Vertex[]): boolean {
  return pointInOrOnPolygon(point, subject) && !pointInPolygonStrict(point, clip) && !pointOnPolygonBoundary(point, clip);
}

function shouldKeepDifferenceSubjectSegment(a: Vertex, b: Vertex, subject: Vertex[], clip: Vertex[]): boolean {
  const mid = midpoint(a, b);

  if (pointInPolygonStrict(mid, clip)) return false;
  if (!pointOnPolygonBoundary(mid, clip)) return true;

  const probeA = offsetPointAlongNormal(mid, a, b, 1);
  const probeB = offsetPointAlongNormal(mid, a, b, -1);
  return pointInDifference(probeA, subject, clip) !== pointInDifference(probeB, subject, clip);
}

function shouldKeepDifferenceClipSegment(a: Vertex, b: Vertex, subject: Vertex[], clip: Vertex[]): boolean {
  const mid = midpoint(a, b);

  if (pointInPolygonStrict(mid, subject)) return true;
  if (!pointOnPolygonBoundary(mid, subject)) return false;

  const probeA = offsetPointAlongNormal(mid, a, b, 1);
  const probeB = offsetPointAlongNormal(mid, a, b, -1);
  return pointInDifference(probeA, subject, clip) !== pointInDifference(probeB, subject, clip);
}

export function subtractPolygon(subjectPolygon: Vertex[], clipPolygon: Vertex[]): Vertex[] | null {
  const subjectRing = closePolygon(subjectPolygon);
  const clipRing = closePolygon(clipPolygon);
  const keptSegments = new Map<string, [Vertex, Vertex]>();

  for (const [a, b] of splitPolygonIntoSegments(subjectRing, clipRing)) {
    if (!shouldKeepDifferenceSubjectSegment(a, b, subjectRing, clipRing)) continue;
    keptSegments.set(segmentMapKey(a, b), [a, b]);
  }

  for (const [a, b] of splitPolygonIntoSegments(clipRing, subjectRing)) {
    if (!shouldKeepDifferenceClipSegment(a, b, subjectRing, clipRing)) continue;
    keptSegments.set(segmentMapKey(a, b), [a, b]);
  }

  return stitchSegmentsToPolygon([...keptSegments.values()]);
}

export function polygonFromCircle(
  center: { latitude: number; longitude: number },
  radiusMeters: number,
  segments: number,
): Vertex[] {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((center.latitude * Math.PI) / 180);

  return Array.from({ length: segments }, (_, index) => {
    const theta = (2 * Math.PI * index) / segments;
    return {
      latitude: center.latitude + (Math.cos(theta) * radiusMeters) / metersPerDegreeLat,
      longitude: center.longitude + (Math.sin(theta) * radiusMeters) / metersPerDegreeLng,
    };
  });
}

function edgesShareSegment(a1: Vertex, a2: Vertex, b1: Vertex, b2: Vertex): boolean {
  // Both edges must be collinear (all four orientations are 0)
  if (
    orientation(a1, a2, b1) !== 0 ||
    orientation(a1, a2, b2) !== 0
  ) {
    return false;
  }

  // Project onto the longer axis to find overlap range
  const dLat = Math.abs(a2.latitude - a1.latitude);
  const dLng = Math.abs(a2.longitude - a1.longitude);
  const useLatitude = dLat >= dLng;

  const aMin = useLatitude ? Math.min(a1.latitude, a2.latitude) : Math.min(a1.longitude, a2.longitude);
  const aMax = useLatitude ? Math.max(a1.latitude, a2.latitude) : Math.max(a1.longitude, a2.longitude);
  const bMin = useLatitude ? Math.min(b1.latitude, b2.latitude) : Math.min(b1.longitude, b2.longitude);
  const bMax = useLatitude ? Math.max(b1.latitude, b2.latitude) : Math.max(b1.longitude, b2.longitude);

  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);

  // Overlap must be a segment (length > epsilon), not just a point
  return overlapMax - overlapMin > EPSILON;
}

export function polygonsAdjacent(polyA: Vertex[], polyB: Vertex[]): boolean {
  // True area overlap: a vertex of one is strictly inside the other
  for (const v of polyA) {
    if (pointInPolygon(v, polyB) && !pointOnPolygonBoundary(v, polyB)) return true;
  }
  for (const v of polyB) {
    if (pointInPolygon(v, polyA) && !pointOnPolygonBoundary(v, polyA)) return true;
  }

  // Shared edge: two edges that are collinear and overlap along a segment
  // (not just a single shared vertex)
  const ringA = closePolygon(polyA);
  const ringB = closePolygon(polyB);

  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (edgesShareSegment(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

export function findParentVertexIndex(
  point: Vertex,
  polygon: Vertex[],
  epsilon = EPSILON,
): number {
  for (let i = 0; i < polygon.length; i++) {
    if (pointsEqual(point, polygon[i], epsilon)) return i;
  }
  return -1;
}

export function snapToVertex(
  point: Vertex,
  polygon: Vertex[],
  thresholdDeg = ADMIN_GEOMETRY_TUNING.vertexSnapThresholdDeg,
): Vertex | null {
  let bestDist = Infinity;
  let bestVertex: Vertex | null = null;

  for (const v of polygon) {
    const dist = Math.sqrt(
      (point.latitude - v.latitude) ** 2 + (point.longitude - v.longitude) ** 2,
    );
    if (dist < bestDist && dist < thresholdDeg) {
      bestDist = dist;
      bestVertex = v;
    }
  }

  return bestVertex;
}

/**
 * Generate discrete snap nodes along every edge of a polygon.
 * Includes original vertices plus evenly-spaced intermediate points.
 */
function generateEdgeNodes(polygon: Vertex[]): Vertex[] {
  const ring = closePolygon(polygon);
  const nodes: Vertex[] = [];
  const METERS_PER_DEGREE = 111_320;
  const NODE_SPACING_METERS = ADMIN_GEOMETRY_TUNING.boundaryNodeSpacingMeters;

  for (let i = 0; i < ring.length - 1; i++) {
    nodes.push(ring[i]);
    const a = ring[i];
    const b = ring[i + 1];
    const dLat = b.latitude - a.latitude;
    const dLng = b.longitude - a.longitude;
    const edgeLengthMeters = Math.sqrt(dLat * dLat + dLng * dLng) * METERS_PER_DEGREE;
    const numSegments = Math.max(1, Math.floor(edgeLengthMeters / NODE_SPACING_METERS));
    for (let j = 1; j < numSegments; j++) {
      const t = j / numSegments;
      nodes.push({
        latitude: a.latitude + t * dLat,
        longitude: a.longitude + t * dLng,
      });
    }
  }

  return nodes;
}

/**
 * Snap a click to the nearest discrete node along the polygon boundary.
 * Nodes include original vertices plus intermediate points every ~12 meters.
 */
export function snapToPolygonBoundary(
  point: Vertex,
  polygon: Vertex[],
  thresholdDeg = ADMIN_GEOMETRY_TUNING.boundarySnapThresholdDeg,
): Vertex | null {
  const nodes = generateEdgeNodes(polygon);
  let bestDist = Infinity;
  let bestNode: Vertex | null = null;

  for (const node of nodes) {
    const dist = Math.sqrt(
      (point.latitude - node.latitude) ** 2 +
      (point.longitude - node.longitude) ** 2,
    );
    if (dist < bestDist && dist < thresholdDeg) {
      bestDist = dist;
      bestNode = node;
    }
  }

  return bestNode;
}

/**
 * Snap the candidate point to the nearest eligible point on any of the
 * supplied polygon boundaries. Preference order:
 *   1. an exact neighbor vertex within `vertexThresholdDeg`
 *   2. the nearest projected boundary point within `boundaryThresholdDeg`
 *
 * Returns the snapped point, or `null` if nothing is within threshold.
 * Intended as an authoring assist for polygon editing — only the edited
 * point is snapped, never untouched vertices.
 */
export function snapToNearbyPolygonBoundaries(
  point: Vertex,
  polygons: Vertex[][],
  boundaryThresholdDeg = ADMIN_GEOMETRY_TUNING.boundarySnapThresholdDeg,
  vertexThresholdDeg = ADMIN_GEOMETRY_TUNING.vertexSnapThresholdDeg,
): Vertex | null {
  let bestVertex: { point: Vertex; dist: number } | null = null;
  let bestEdge: { point: Vertex; dist: number } | null = null;

  for (const polygon of polygons) {
    if (!polygon || polygon.length < 2) continue;
    const ring = closePolygon(polygon);

    for (let i = 0; i < ring.length - 1; i++) {
      const v = ring[i];
      const dv = Math.sqrt(
        (point.latitude - v.latitude) ** 2 +
        (point.longitude - v.longitude) ** 2,
      );
      if (dv < vertexThresholdDeg && (!bestVertex || dv < bestVertex.dist)) {
        bestVertex = { point: v, dist: dv };
      }

      const projected = closestPointOnSegment(point, ring[i], ring[i + 1]);
      const de = Math.sqrt(
        (point.latitude - projected.latitude) ** 2 +
        (point.longitude - projected.longitude) ** 2,
      );
      if (de < boundaryThresholdDeg && (!bestEdge || de < bestEdge.dist)) {
        bestEdge = { point: projected, dist: de };
      }
    }
  }

  if (bestVertex) return bestVertex.point;
  if (bestEdge) return bestEdge.point;
  return null;
}

export function isPointOnPolygonEdge(
  point: Vertex,
  polygon: Vertex[],
  epsilon = 1e-7,
): boolean {
  const ring = closePolygon(polygon);
  for (let i = 0; i < ring.length - 1; i++) {
    if (isPointOnSegment(point, ring[i], ring[i + 1], epsilon)) return true;
  }
  return false;
}

export function canAddSplitPoint(
  currentLine: Vertex[],
  newPoint: Vertex,
  parentPolygon: Vertex[],
): boolean {
  if (currentLine.length === 0) return true;

  const lastPoint = currentLine[currentLine.length - 1];

  // Self-intersection check
  if (currentLine.length >= 2) {
    for (let i = 0; i < currentLine.length - 2; i++) {
      if (segmentsIntersect(lastPoint, newPoint, currentLine[i], currentLine[i + 1])) {
        return false;
      }
    }
  }

  // Parent boundary crossing check — the new segment must not cross a parent
  // edge unless the crossing point is at lastPoint or newPoint (endpoints that
  // are on the boundary).
  const ring = closePolygon(parentPolygon);
  for (let i = 0; i < ring.length - 1; i++) {
    if (!segmentsIntersect(lastPoint, newPoint, ring[i], ring[i + 1])) continue;
    const lastOnEdge = isPointOnSegment(lastPoint, ring[i], ring[i + 1]);
    const newOnEdge = isPointOnSegment(newPoint, ring[i], ring[i + 1]);
    if (!lastOnEdge && !newOnEdge) return false;
  }

  return true;
}

export function validateSplitLineClient(
  splitLine: Vertex[],
  parentPolygon: Vertex[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (splitLine.length < 2) {
    errors.push('Split line must have at least 2 points.');
    return { valid: false, errors };
  }

  if (!isPointOnPolygonEdge(splitLine[0], parentPolygon)) {
    errors.push('Split line must start on the parent polygon boundary.');
  }

  if (!isPointOnPolygonEdge(splitLine[splitLine.length - 1], parentPolygon)) {
    errors.push('Split line must end on the parent polygon boundary.');
  }

  if (errors.length === 0 && pointsEqual(splitLine[0], splitLine[splitLine.length - 1], 1e-7)) {
    errors.push('Split line start and end must be different points.');
  }

  return { valid: errors.length === 0, errors };
}

function insertPointOnPolygonEdge(
  ring: Vertex[],
  point: Vertex,
  epsilon = 1e-7,
): { ring: Vertex[]; index: number } | null {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    if (pointsEqual(point, ring[i], epsilon)) {
      return { ring: [...ring], index: i };
    }
  }
  for (let i = 0; i < n; i++) {
    if (isPointOnSegment(point, ring[i], ring[i + 1], epsilon)) {
      const openVerts = ring.slice(0, -1);
      const newOpen = [...openVerts.slice(0, i + 1), point, ...openVerts.slice(i + 1)];
      return { ring: closePolygon(newOpen), index: i + 1 };
    }
  }
  return null;
}

export function buildChildPolygonsFromSplit(
  parentPolygon: Vertex[],
  splitLine: Vertex[],
): [Vertex[], Vertex[]] | null {
  if (splitLine.length < 2) return null;

  let ring = closePolygon(parentPolygon);
  const startPoint = splitLine[0];
  const endPoint = splitLine[splitLine.length - 1];

  const startResult = insertPointOnPolygonEdge(ring, startPoint);
  if (!startResult) return null;
  ring = startResult.ring;

  const endResult = insertPointOnPolygonEdge(ring, endPoint);
  if (!endResult) return null;
  ring = endResult.ring;

  const n = ring.length - 1;
  let startIdx = -1;
  let endIdx = -1;
  for (let idx = 0; idx < n; idx++) {
    if (startIdx === -1 && pointsEqual(ring[idx], startPoint, 1e-7)) startIdx = idx;
    if (endIdx === -1 && pointsEqual(ring[idx], endPoint, 1e-7)) endIdx = idx;
  }

  if (startIdx === -1 || endIdx === -1 || startIdx === endIdx) return null;

  const arcA: Vertex[] = [];
  let i = startIdx;
  while (true) {
    arcA.push(ring[i]);
    if (i === endIdx) break;
    i = (i + 1) % n;
  }

  const arcB: Vertex[] = [];
  i = endIdx;
  while (true) {
    arcB.push(ring[i]);
    if (i === startIdx) break;
    i = (i + 1) % n;
  }

  const splitInterior = splitLine.slice(1, -1);

  const childA = closePolygon([...arcA, ...splitInterior.slice().reverse()]);
  const childB = closePolygon([...arcB, ...splitInterior]);

  return [childA, childB];
}
