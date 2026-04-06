/**
 * Pure geometry utility functions for polygon validation.
 * All vertices are { latitude, longitude } objects.
 * No database calls or side effects.
 */

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

  if (Math.abs(val) < 1e-12) {
    return 0;
  }

  return val > 0 ? 1 : 2;
}

/**
 * Check if point q lies on segment pr (when p, q, r are collinear).
 */
function onSegment(p, q, r) {
  return (
    q.latitude <= Math.max(p.latitude, r.latitude) &&
    q.latitude >= Math.min(p.latitude, r.latitude) &&
    q.longitude <= Math.max(p.longitude, r.longitude) &&
    q.longitude >= Math.min(p.longitude, r.longitude)
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

module.exports = {
  isClosedPolygon,
  hasMinVertices,
  hasSelfIntersection,
  segmentsIntersect,
  pointInPolygon,
  allPointsInPolygon,
  polygonsOverlap,
  validatePolygon,
  computeConvexHull,
  bufferPolygon,
};
