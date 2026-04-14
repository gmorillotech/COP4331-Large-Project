/**
 * Unit tests for snapVerticesToNeighborEdges — the save-/merge-time
 * normalization that eliminates float-precision drift from admin-side
 * boundary snapping.
 */

const {
  snapVerticesToNeighborEdges,
  polygonsShareBorder,
  unionPolygons,
  distanceMeters,
} = require("../services/geometryValidation");

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`PASS ${name}`);
    passed++;
  } else {
    console.log(`FAIL ${name}`);
    failed++;
  }
}

// Near UCF: 1e-4 degrees lat ≈ 11.13 m. 1e-7 deg ≈ 0.01 m. Tolerance 0.3 m
// ≈ 2.7e-6 deg.

const TOL = 0.3;

// ── Test 1: vertex well inside tolerance → snapped onto edge ─────────
{
  const neighbor = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  // Vertex 0.0000001 deg lng off neighbor's left edge (≈ 1 cm)
  const submitted = [
    { latitude: 0.00005, longitude: 0.000200001 },
  ];
  const result = snapVerticesToNeighborEdges(submitted, [neighbor], TOL);
  assert(
    result[0].longitude === 0.0002,
    `within-tol: longitude snapped to edge (got ${result[0].longitude})`,
  );
}

// ── Test 2: vertex outside tolerance → untouched ─────────────────────
{
  const neighbor = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  // ~1.1 m away from left edge — well outside 0.3 m tolerance
  const submitted = [{ latitude: 0.00005, longitude: 0.00019 }];
  const result = snapVerticesToNeighborEdges(submitted, [neighbor], TOL);
  assert(
    result[0].longitude === 0.00019,
    "outside-tol: vertex untouched",
  );
}

// ── Test 3: empty otherPolygons → untouched ──────────────────────────
{
  const submitted = [{ latitude: 1, longitude: 2 }];
  const result = snapVerticesToNeighborEdges(submitted, [], TOL);
  assert(
    result[0].latitude === 1 && result[0].longitude === 2,
    "empty neighbors: vertex untouched",
  );
}

// ── Test 4: end-to-end — drift polygons snap → unionPolygons succeeds ─
// A polygon with two consecutive vertices "snapped" onto B's left edge but
// shifted by 5e-8 deg of drift (~5 mm). Raw unionPolygons might be fragile;
// after normalization it should reliably produce a valid ring.
{
  const B = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  const DRIFT = 5e-8;
  const Araw = [
    { latitude: 0, longitude: 0 },
    { latitude: 0.00005, longitude: 0.0002 + DRIFT }, // near B's left edge
    { latitude: 0.00015, longitude: 0.0002 - DRIFT }, // near B's left edge
    { latitude: 0.0002, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const Anormalized = snapVerticesToNeighborEdges(Araw, [B], TOL);
  // Both drifted vertices should now have longitude === 0.0002 exactly
  assert(
    Anormalized[1].longitude === 0.0002,
    `drift: vertex 1 normalized to 0.0002 (got ${Anormalized[1].longitude})`,
  );
  assert(
    Anormalized[2].longitude === 0.0002,
    `drift: vertex 2 normalized to 0.0002 (got ${Anormalized[2].longitude})`,
  );
  assert(polygonsShareBorder(Anormalized, B), "drift: shared border after normalize");
  const merged = unionPolygons(Anormalized, B);
  assert(merged && merged.length >= 5, `drift: union succeeds (got ${merged ? merged.length : "null"} vertices)`);
}

// ── Test 5: preserve non-drifted vertex coordinates byte-exact ───────
{
  const neighbor = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  // Interior vertex far from any neighbor edge
  const submitted = [{ latitude: 0.00007, longitude: 0.00007 }];
  const result = snapVerticesToNeighborEdges(submitted, [neighbor], TOL);
  assert(
    result[0].latitude === 0.00007 && result[0].longitude === 0.00007,
    "far-vertex: coordinates preserved exactly",
  );
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
