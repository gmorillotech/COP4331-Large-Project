/**
 * Pure geometry utility functions for polygon validation.
 * All vertices are { latitude, longitude } objects.
 * No database calls or side effects.
 */

const EPSILON = 1e-9;

function pointKey(point) {
  return `${point.latitude.toFixed(12)},${point.longitude.toFixed(12)}`;
}

function pointsEqual(a, b, epsilon = EPSILON) {
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon
  );
}

function dedupePoints(points) {
  const seen = new Set();
  const unique = [];

  for (const point of points) {
    const key = pointKey(point);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(point);
  }

  return unique;
}

/**
 * Check if first and last vertex are the same (ring is closed).
 * Returns the vertices array, auto-closing if needed.
 */
function isClosedPolygon(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 2) {
    return { closed: false, vertices };
  }

  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  const same =
    first.latitude === last.latitude && first.longitude === last.longitude;

  if (same) {
    return { closed: true, vertices };
  }

  // Auto-close by appending a copy of the first vertex
  const closedVertices = [...vertices, { latitude: first.latitude, longitude: first.longitude }];
  return { closed: false, vertices: closedVertices };
}

/**
 * Check if there are at least `min` distinct vertices (ignoring the closing vertex).
 */
function hasMinVertices(vertices, min = 3) {
  if (!Array.isArray(vertices)) {
    return false;
  }

  // Deduplicate to count truly distinct vertices
  const seen = new Set();
  for (const v of vertices) {
    const key = `${v.latitude},${v.longitude}`;
    seen.add(key);
  }

  return seen.size >= min;
}

/**
 * Determine the orientation of the triplet (p, q, r).
 * Returns:  0 = collinear, 1 = clockwise, 2 = counterclockwise
 */
function orientation(p, q, r) {
  const val =
    (q.longitude - p.longitude) * (r.latitude - q.latitude) -
    (q.latitude - p.latitude) * (r.longitude - q.longitude);

  if (Math.abs(val) < EPSILON) {
    return 0;
  }

  return val > 0 ? 1 : 2;
}

/**
 * Check if point q lies on segment pr (when p, q, r are collinear).
 */
function onSegment(p, q, r) {
  return (
    q.latitude <= Math.max(p.latitude, r.latitude) + EPSILON &&
    q.latitude >= Math.min(p.latitude, r.latitude) - EPSILON &&
    q.longitude <= Math.max(p.longitude, r.longitude) + EPSILON &&
    q.longitude >= Math.min(p.longitude, r.longitude) - EPSILON
  );
}

/**
 * Check if segment (p1, q1) intersects segment (p2, q2).
 */
function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  // General case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Collinear special cases
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

/**
 * Check if any non-adjacent edges of the polygon cross each other.
 * Expects a closed ring (first == last vertex).
 */
function hasSelfIntersection(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 4) {
    return false;
  }

  const n = vertices.length - 1; // number of edges (last vertex == first)

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (they share a vertex)
      if (i === 0 && j === n - 1) {
        continue;
      }

      if (segmentsIntersect(vertices[i], vertices[i + 1], vertices[j], vertices[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Ray casting algorithm: determine if a point is inside a polygon.
 * Vertices should form a closed ring (first == last).
 */
function pointInPolygon(point, vertices) {
  if (!Array.isArray(vertices) || vertices.length < 4) {
    return false;
  }

  const n = vertices.length - 1; // number of edges
  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].latitude;
    const yi = vertices[i].longitude;
    const xj = vertices[j].latitude;
    const yj = vertices[j].longitude;

    const intersect =
      yi > point.longitude !== yj > point.longitude &&
      point.latitude < ((xj - xi) * (point.longitude - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function pointOnPolygonBoundary(point, vertices) {
  if (!Array.isArray(vertices) || vertices.length < 4) {
    return false;
  }

  for (let i = 0; i < vertices.length - 1; i++) {
    if (
      orientation(vertices[i], point, vertices[i + 1]) === 0 &&
      onSegment(vertices[i], point, vertices[i + 1])
    ) {
      return true;
    }
  }

  return false;
}

function pointInPolygonStrict(point, vertices) {
  return pointInPolygon(point, vertices) && !pointOnPolygonBoundary(point, vertices);
}

/**
 * Check that every point in `points` is inside the polygon defined by `vertices`.
 */
function allPointsInPolygon(points, vertices) {
  if (!Array.isArray(points) || points.length === 0) {
    return true;
  }

  return points.every((p) => pointInPolygon(p, vertices));
}

/**
 * Check if two polygons overlap.
 * Two polygons overlap if any vertex of one is inside the other,
 * or if any edges cross each other.
 * Both polygons should be closed rings.
 */
function polygonsOverlap(polyA, polyB) {
  if (
    !Array.isArray(polyA) ||
    !Array.isArray(polyB) ||
    polyA.length < 4 ||
    polyB.length < 4
  ) {
    return false;
  }

  // Check if any vertex of A is inside B
  const nA = polyA.length - 1;
  for (let i = 0; i < nA; i++) {
    if (pointInPolygon(polyA[i], polyB)) {
      return true;
    }
  }

  // Check if any vertex of B is inside A
  const nB = polyB.length - 1;
  for (let i = 0; i < nB; i++) {
    if (pointInPolygon(polyB[i], polyA)) {
      return true;
    }
  }

  // Check if any edges cross
  for (let i = 0; i < nA; i++) {
    for (let j = 0; j < nB; j++) {
      if (segmentsIntersect(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

function segmentsProperlyIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function polygonsHaveAreaOverlap(polyA, polyB) {
  if (
    !Array.isArray(polyA) ||
    !Array.isArray(polyB) ||
    polyA.length < 4 ||
    polyB.length < 4
  ) {
    return false;
  }

  const nA = polyA.length - 1;
  for (let i = 0; i < nA; i++) {
    if (pointInPolygonStrict(polyA[i], polyB)) {
      return true;
    }
  }

  const nB = polyB.length - 1;
  for (let i = 0; i < nB; i++) {
    if (pointInPolygonStrict(polyB[i], polyA)) {
      return true;
    }
  }

  for (let i = 0; i < nA; i++) {
    for (let j = 0; j < nB; j++) {
      if (segmentsProperlyIntersect(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

function segmentLengthSquared(a, b) {
  const dLat = a.latitude - b.latitude;
  const dLng = a.longitude - b.longitude;
  return dLat * dLat + dLng * dLng;
}

function collinearSegmentsOverlap(p1, q1, p2, q2) {
  if (
    orientation(p1, q1, p2) !== 0 ||
    orientation(p1, q1, q2) !== 0 ||
    orientation(p2, q2, p1) !== 0 ||
    orientation(p2, q2, q1) !== 0
  ) {
    return false;
  }

  const overlapPoints = dedupePoints(
    [p1, q1, p2, q2].filter((point) => onSegment(p1, point, q1) && onSegment(p2, point, q2)),
  );

  if (overlapPoints.length < 2) {
    return false;
  }

  for (let i = 0; i < overlapPoints.length; i++) {
    for (let j = i + 1; j < overlapPoints.length; j++) {
      if (segmentLengthSquared(overlapPoints[i], overlapPoints[j]) > EPSILON * EPSILON) {
        return true;
      }
    }
  }

  return false;
}

function polygonsShareBorder(polyA, polyB) {
  if (
    !Array.isArray(polyA) ||
    !Array.isArray(polyB) ||
    polyA.length < 4 ||
    polyB.length < 4
  ) {
    return false;
  }

  const nA = polyA.length - 1;
  const nB = polyB.length - 1;

  for (let i = 0; i < nA; i++) {
    for (let j = 0; j < nB; j++) {
      if (collinearSegmentsOverlap(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

function polygonsTouchOrOverlap(polyA, polyB) {
  return polygonsHaveAreaOverlap(polyA, polyB) || polygonsShareBorder(polyA, polyB);
}

function lineIntersection(p1, q1, p2, q2) {
  const x1 = p1.latitude;
  const y1 = p1.longitude;
  const x2 = q1.latitude;
  const y2 = q1.longitude;
  const x3 = p2.latitude;
  const y3 = p2.longitude;
  const x4 = q2.latitude;
  const y4 = q2.longitude;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;

  return {
    latitude: (det1 * (x3 - x4) - (x1 - x2) * det2) / denominator,
    longitude: (det1 * (y3 - y4) - (y1 - y2) * det2) / denominator,
  };
}

function segmentIntersectionPoints(p1, q1, p2, q2) {
  if (!segmentsIntersect(p1, q1, p2, q2)) {
    return [];
  }

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

function projectPointT(point, start, end) {
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  if (Math.abs(dLat) >= Math.abs(dLng)) {
    return Math.abs(dLat) < EPSILON ? 0 : (point.latitude - start.latitude) / dLat;
  }

  return Math.abs(dLng) < EPSILON ? 0 : (point.longitude - start.longitude) / dLng;
}

function midpoint(a, b) {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

function pointInOrOnPolygon(point, vertices) {
  return pointInPolygonStrict(point, vertices) || pointOnPolygonBoundary(point, vertices);
}

function offsetPointAlongNormal(point, start, end, direction = 1, epsilon = 1e-7) {
  const dx = end.latitude - start.latitude;
  const dy = end.longitude - start.longitude;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < EPSILON) {
    return point;
  }

  const normalLat = (-dy / length) * epsilon * direction;
  const normalLng = (dx / length) * epsilon * direction;

  return {
    latitude: point.latitude + normalLat,
    longitude: point.longitude + normalLng,
  };
}

function shouldKeepUnionSegment(a, b, ownPoly, otherPoly) {
  const mid = midpoint(a, b);

  if (pointInPolygonStrict(mid, otherPoly)) {
    return false;
  }

  if (!pointOnPolygonBoundary(mid, otherPoly)) {
    return true;
  }

  const probeA = offsetPointAlongNormal(mid, a, b, 1);
  const probeB = offsetPointAlongNormal(mid, a, b, -1);
  const probeAInsideUnion = pointInOrOnPolygon(probeA, ownPoly) || pointInOrOnPolygon(probeA, otherPoly);
  const probeBInsideUnion = pointInOrOnPolygon(probeB, ownPoly) || pointInOrOnPolygon(probeB, otherPoly);

  return probeAInsideUnion !== probeBInsideUnion;
}

function splitPolygonIntoSegments(sourcePoly, clipPoly) {
  const ring = isClosedPolygon(sourcePoly).vertices;
  const clipRing = isClosedPolygon(clipPoly).vertices;
  const segments = [];

  for (let i = 0; i < ring.length - 1; i++) {
    const start = ring[i];
    const end = ring[i + 1];
    const splitPoints = [start, end];

    for (let j = 0; j < clipRing.length - 1; j++) {
      splitPoints.push(...segmentIntersectionPoints(start, end, clipRing[j], clipRing[j + 1]));
    }

    const orderedPoints = dedupePoints(splitPoints)
      .map((point) => ({ point, t: projectPointT(point, start, end) }))
      .sort((left, right) => left.t - right.t)
      .map(({ point }) => point);

    for (let j = 0; j < orderedPoints.length - 1; j++) {
      const a = orderedPoints[j];
      const b = orderedPoints[j + 1];
      if (segmentLengthSquared(a, b) <= EPSILON * EPSILON) {
        continue;
      }
      segments.push([a, b]);
    }
  }

  return segments;
}

function segmentMapKey(a, b) {
  const keyA = pointKey(a);
  const keyB = pointKey(b);
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function simplifyPolygon(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 4) {
    return vertices;
  }

  const simplified = [vertices[0]];

  for (let i = 1; i < vertices.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const current = vertices[i];
    const next = vertices[i + 1];

    if (
      orientation(prev, current, next) === 0 &&
      onSegment(prev, current, next)
    ) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(simplified[0]);
  return simplified;
}

function stitchSegmentsToPolygon(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const adjacency = new Map();
  for (const [a, b] of segments) {
    const keyA = pointKey(a);
    const keyB = pointKey(b);

    if (!adjacency.has(keyA)) adjacency.set(keyA, []);
    if (!adjacency.has(keyB)) adjacency.set(keyB, []);
    adjacency.get(keyA).push({ point: a, next: b });
    adjacency.get(keyB).push({ point: b, next: a });
  }

  for (const neighbors of adjacency.values()) {
    if (neighbors.length !== 2) {
      return null;
    }
  }

  const orderedKeys = [...adjacency.keys()].sort();
  const startKey = orderedKeys[0];
  const startPoint = adjacency.get(startKey)[0].point;
  const polygon = [startPoint];
  const visitedEdges = new Set();

  let current = startPoint;
  let previous = null;

  while (true) {
    const currentKey = pointKey(current);
    const neighbors = adjacency.get(currentKey) ?? [];
    let nextPoint = null;

    for (const neighbor of neighbors) {
      const edgeKey = segmentMapKey(current, neighbor.next);
      if (visitedEdges.has(edgeKey)) {
        continue;
      }
      if (previous && pointsEqual(neighbor.next, previous)) {
        continue;
      }
      nextPoint = neighbor.next;
      visitedEdges.add(edgeKey);
      break;
    }

    if (!nextPoint) {
      if (!previous && neighbors[0]) {
        nextPoint = neighbors[0].next;
        visitedEdges.add(segmentMapKey(current, nextPoint));
      } else {
        break;
      }
    }

    polygon.push(nextPoint);
    previous = current;
    current = nextPoint;

    if (pointsEqual(current, startPoint)) {
      break;
    }
  }

  if (!pointsEqual(polygon[polygon.length - 1], polygon[0])) {
    return null;
  }

  if (visitedEdges.size !== segments.length) {
    return null;
  }

  return simplifyPolygon(polygon);
}

function unionPolygons(polyA, polyB) {
  const ringA = isClosedPolygon(polyA).vertices;
  const ringB = isClosedPolygon(polyB).vertices;
  const keptSegments = new Map();

  for (const [a, b] of splitPolygonIntoSegments(ringA, ringB)) {
    if (!shouldKeepUnionSegment(a, b, ringA, ringB)) {
      continue;
    }
    keptSegments.set(segmentMapKey(a, b), [a, b]);
  }

  for (const [a, b] of splitPolygonIntoSegments(ringB, ringA)) {
    if (!shouldKeepUnionSegment(a, b, ringB, ringA)) {
      continue;
    }
    keptSegments.set(segmentMapKey(a, b), [a, b]);
  }

  return stitchSegmentsToPolygon([...keptSegments.values()]);
}

/**
 * Orchestrator: validate a polygon against all constraints.
 * Returns { valid: boolean, errors: string[] }.
 *
 * @param {Array} vertices - The polygon vertices to validate.
 * @param {Array} otherGroupPolygons - Array of closed polygon vertex arrays from other groups.
 * @param {Array} childLocationPoints - Array of { latitude, longitude } for child StudyLocations.
 */
function validatePolygon(vertices, otherGroupPolygons, childLocationPoints) {
  const errors = [];

  if (!Array.isArray(vertices) || vertices.length === 0) {
    errors.push("Polygon vertices are required.");
    return { valid: false, errors };
  }

  // Auto-close if needed
  const closeResult = isClosedPolygon(vertices);
  const ring = closeResult.vertices;

  // Minimum vertices check
  if (!hasMinVertices(ring, 3)) {
    errors.push("Polygon must have at least 3 distinct vertices.");
  }

  // Self-intersection check
  if (hasSelfIntersection(ring)) {
    errors.push("Polygon must not self-intersect.");
  }

  // Only proceed with overlap / containment checks if basic shape is valid
  if (errors.length === 0) {
    // Check overlap with other groups
    if (Array.isArray(otherGroupPolygons)) {
      for (let i = 0; i < otherGroupPolygons.length; i++) {
        if (polygonsOverlap(ring, otherGroupPolygons[i])) {
          errors.push(`Polygon overlaps with another group's polygon (index ${i}).`);
          break;
        }
      }
    }

    // Check that all child locations are inside the polygon
    if (Array.isArray(childLocationPoints) && childLocationPoints.length > 0) {
      if (!allPointsInPolygon(childLocationPoints, ring)) {
        errors.push("Polygon must contain all child study location markers.");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute the convex hull of a set of points using the Graham scan algorithm.
 * Returns vertices in counter-clockwise order (not closed).
 */
function computeConvexHull(points) {
  if (points.length < 3) {
    return [...points];
  }

  const sorted = [...points].sort((a, b) => {
    if (a.latitude !== b.latitude) return a.latitude - b.latitude;
    return a.longitude - b.longitude;
  });

  const pivot = sorted[0];

  const rest = sorted.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.longitude - pivot.longitude, a.latitude - pivot.latitude);
    const angleB = Math.atan2(b.longitude - pivot.longitude, b.latitude - pivot.latitude);
    if (Math.abs(angleA - angleB) < 1e-12) {
      const distA =
        (a.latitude - pivot.latitude) ** 2 + (a.longitude - pivot.longitude) ** 2;
      const distB =
        (b.latitude - pivot.latitude) ** 2 + (b.longitude - pivot.longitude) ** 2;
      return distA - distB;
    }
    return angleA - angleB;
  });

  const hull = [pivot];

  for (const p of rest) {
    while (hull.length >= 2) {
      const top = hull[hull.length - 1];
      const secondTop = hull[hull.length - 2];
      const cross =
        (top.latitude - secondTop.latitude) * (p.longitude - secondTop.longitude) -
        (top.longitude - secondTop.longitude) * (p.latitude - secondTop.latitude);
      if (cross <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(p);
  }

  return hull;
}

/**
 * Buffer a polygon outward by `meters` in all directions.
 * Offsets each vertex outward from the centroid by the given distance.
 */
function bufferPolygon(vertices, meters) {
  if (vertices.length === 0) {
    return [];
  }

  const centLat =
    vertices.reduce((s, v) => s + v.latitude, 0) / vertices.length;
  const centLng =
    vertices.reduce((s, v) => s + v.longitude, 0) / vertices.length;

  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng =
    111320 * Math.cos((centLat * Math.PI) / 180);

  return vertices.map((v) => {
    const dLat = v.latitude - centLat;
    const dLng = v.longitude - centLng;
    const dist = Math.sqrt(
      (dLat * metersPerDegreeLat) ** 2 + (dLng * metersPerDegreeLng) ** 2,
    );

    if (dist < 1e-9) {
      return {
        latitude: v.latitude + meters / metersPerDegreeLat,
        longitude: v.longitude,
      };
    }

    const scale = (dist + meters) / dist;
    return {
      latitude: centLat + dLat * scale,
      longitude: centLng + dLng * scale,
    };
  });
}

/**
 * Search the open vertices of a closed polygon ring for a vertex matching the
 * given point within epsilon tolerance. Excludes the closing vertex.
 * Returns the index of the matching vertex, or -1 if not found.
 */
function findVertexIndex(vertex, polygon, epsilon = EPSILON) {
  const n = polygon.length - 1; // exclude closing vertex
  for (let i = 0; i < n; i++) {
    if (pointsEqual(vertex, polygon[i], epsilon)) return i;
  }
  return -1;
}

/**
 * Validate that a split polyline is valid for splitting the parent polygon.
 * Returns { valid: boolean, errors: string[], startIndex: number, endIndex: number }.
 */
function validateSplitLine(splitLine, parentPolygon) {
  const errors = [];
  let startIndex = -1;
  let endIndex = -1;

  if (!Array.isArray(splitLine) || splitLine.length < 2) {
    errors.push("Split line must have at least 2 points.");
    return { valid: false, errors, startIndex, endIndex };
  }

  startIndex = findVertexIndex(splitLine[0], parentPolygon);
  if (startIndex === -1) {
    errors.push("Split line start point must be a vertex of the parent polygon.");
  }

  endIndex = findVertexIndex(splitLine[splitLine.length - 1], parentPolygon);
  if (endIndex === -1) {
    errors.push("Split line end point must be a vertex of the parent polygon.");
  }

  if (startIndex !== -1 && endIndex !== -1 && startIndex === endIndex) {
    errors.push("Split line start and end must be different polygon vertices.");
  }

  if (errors.length > 0) {
    return { valid: false, errors, startIndex, endIndex };
  }

  if (splitLine.length > 2) {
    const numSegs = splitLine.length - 1;
    for (let i = 0; i < numSegs; i++) {
      for (let j = i + 2; j < numSegs; j++) {
        if (segmentsIntersect(splitLine[i], splitLine[i + 1], splitLine[j], splitLine[j + 1])) {
          errors.push("Split line must not self-intersect.");
          break;
        }
      }
      if (errors.length > 0) break;
    }
  }

  for (let i = 1; i < splitLine.length - 1; i++) {
    if (!pointInPolygon(splitLine[i], parentPolygon)) {
      errors.push("All interior points of the split line must be inside the parent polygon.");
      break;
    }
  }

  // Split line segments must not cross parent polygon edges except at start/end vertices
  const n = parentPolygon.length - 1; // number of parent edges
  const numSplitSegs = splitLine.length - 1;
  let hasCrossing = false;

  for (let si = 0; si < numSplitSegs && !hasCrossing; si++) {
    for (let pi = 0; pi < n; pi++) {
      if (!segmentsIntersect(splitLine[si], splitLine[si + 1], parentPolygon[pi], parentPolygon[pi + 1])) {
        continue;
      }

      // Allow intersection if this is the first split segment touching startIndex vertex edges
      if (si === 0 && (pi === startIndex || pi === ((startIndex - 1 + n) % n))) {
        continue;
      }

      // Allow intersection if this is the last split segment touching endIndex vertex edges
      if (si === numSplitSegs - 1 && (pi === endIndex || pi === ((endIndex - 1 + n) % n))) {
        continue;
      }

      errors.push("Split line must not cross parent polygon edges except at start and end vertices.");
      hasCrossing = true;
      break;
    }
  }

  return { valid: errors.length === 0, errors, startIndex, endIndex };
}

/**
 * Given a valid closed parent polygon, split line, and vertex indices,
 * produce two child polygons by walking the polygon arcs and combining
 * with the split line.
 * Returns [childA, childB].
 */
function splitPolygonByPolyline(parentPolygon, splitLine, startIndex, endIndex) {
  const ring = isClosedPolygon(parentPolygon).vertices;
  const n = ring.length - 1; // open vertex count

  const arcA = [];
  let i = startIndex;
  while (true) {
    arcA.push(ring[i]);
    if (i === endIndex) break;
    i = (i + 1) % n;
  }

  const arcB = [];
  i = endIndex;
  while (true) {
    arcB.push(ring[i]);
    if (i === startIndex) break;
    i = (i + 1) % n;
  }

  const splitInterior = splitLine.slice(1, -1);

  const childAOpen = [...arcA, ...splitInterior.slice().reverse()];
  const childA = [...childAOpen, { latitude: childAOpen[0].latitude, longitude: childAOpen[0].longitude }];

  const childBOpen = [...arcB, ...splitInterior];
  const childB = [...childBOpen, { latitude: childBOpen[0].latitude, longitude: childBOpen[0].longitude }];

  return [childA, childB];
}

/**
 * Assign each point to child A or B using pointInPolygon.
 * Returns { groupA: number[], groupB: number[] } (arrays of indices into points),
 * or null if any point falls outside both children.
 */
function classifyPointsForSplit(points, childA, childB) {
  const groupA = [];
  const groupB = [];

  for (let i = 0; i < points.length; i++) {
    const inA = pointInPolygon(points[i], childA);
    const inB = pointInPolygon(points[i], childB);

    if (inA) {
      // If in A (including boundary/both case), assign to groupA
      groupA.push(i);
    } else if (inB) {
      groupB.push(i);
    } else {
      // Point is outside both children — error
      return null;
    }
  }

  return { groupA, groupB };
}

/**
 * Top-level orchestrator for split geometry validation.
 * Returns { valid, errors, childA, childB, classification }.
 */
function validateSplitGeometry(parentPolygon, splitLine, otherGroupPolygons, childLocationPoints) {
  const errors = [];
  let childA = null;
  let childB = null;
  let classification = null;

  // 1. Auto-close parent
  const closeResult = isClosedPolygon(parentPolygon);
  const parentRing = closeResult.vertices;

  // 2. Check minimum vertices
  if (!hasMinVertices(parentRing, 3)) {
    errors.push("Parent polygon must have at least 3 distinct vertices.");
    return { valid: false, errors, childA, childB, classification };
  }

  // 3. Check self-intersection
  if (hasSelfIntersection(parentRing)) {
    errors.push("Parent polygon must not self-intersect.");
    return { valid: false, errors, childA, childB, classification };
  }

  // 4. Validate the split line
  const splitResult = validateSplitLine(splitLine, parentRing);
  if (!splitResult.valid) {
    return { valid: false, errors: splitResult.errors, childA, childB, classification };
  }

  // 5. Split the polygon
  const children = splitPolygonByPolyline(parentRing, splitLine, splitResult.startIndex, splitResult.endIndex);
  childA = children[0];
  childB = children[1];

  // 6. Check each child against other group polygons for overlap
  if (Array.isArray(otherGroupPolygons)) {
    for (let i = 0; i < otherGroupPolygons.length; i++) {
      if (polygonsOverlap(childA, otherGroupPolygons[i])) {
        errors.push(`Child polygon A overlaps with another group's polygon (index ${i}).`);
        break;
      }
    }
    for (let i = 0; i < otherGroupPolygons.length; i++) {
      if (polygonsOverlap(childB, otherGroupPolygons[i])) {
        errors.push(`Child polygon B overlaps with another group's polygon (index ${i}).`);
        break;
      }
    }
  }

  // 7. Classify child location points
  if (Array.isArray(childLocationPoints) && childLocationPoints.length > 0) {
    classification = classifyPointsForSplit(childLocationPoints, childA, childB);
    if (classification === null) {
      errors.push("One or more child location points fall outside both child polygons.");
    }
  }

  // 8. Check minimum vertices on each child
  if (childA && !hasMinVertices(childA, 3)) {
    errors.push("Child polygon A must have at least 3 distinct vertices.");
  }
  if (childB && !hasMinVertices(childB, 3)) {
    errors.push("Child polygon B must have at least 3 distinct vertices.");
  }

  return { valid: errors.length === 0, errors, childA, childB, classification };
}

module.exports = {
  isClosedPolygon,
  hasMinVertices,
  hasSelfIntersection,
  segmentsIntersect,
  pointInPolygon,
  pointOnPolygonBoundary,
  pointInPolygonStrict,
  allPointsInPolygon,
  polygonsOverlap,
  polygonsHaveAreaOverlap,
  polygonsShareBorder,
  polygonsTouchOrOverlap,
  validatePolygon,
  computeConvexHull,
  bufferPolygon,
  unionPolygons,
  findVertexIndex,
  validateSplitLine,
  splitPolygonByPolyline,
  classifyPointsForSplit,
  validateSplitGeometry,
};
