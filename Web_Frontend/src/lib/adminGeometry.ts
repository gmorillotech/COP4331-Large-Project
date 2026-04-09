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
  segments = 8,
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
