/**
 * Reproduce union-failure scenarios that the admin UI can create via
 * vertex snapping, then verify unionPolygons returns a valid ring.
 *
 * The common case the frontend produces:
 *   - polygon B is a rectangle with vertices V0..V3
 *   - admin drags two consecutive vertices of A onto an edge of B, landing
 *     at projected points *interior* to that B edge (not at B's vertices)
 *   - A now has an edge that lies entirely on B's edge, but B's edge
 *     endpoints are NOT A vertices
 *
 * This is the configuration that produces the "Groups share geometry but
 * a clean merged polygon could not be produced" 400 error.
 */

const {
  unionPolygons,
  polygonsShareBorder,
  polygonsTouchOrOverlap,
  hasSelfIntersection,
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

// ── Scenario 1: clean shared edge — A's whole right edge is B's whole left edge.
// This is the existing baseline case and should succeed.
{
  const A = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const B = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  assert(polygonsShareBorder(A, B), "baseline: polygonsShareBorder true");
  const merged = unionPolygons(A, B);
  assert(merged && merged.length >= 5, `baseline: union non-null (got ${merged ? merged.length : "null"} vertices)`);
  if (merged) assert(!hasSelfIntersection(merged), "baseline: union is simple (no self-intersection)");
}

// ── Scenario 2: A's snapped points sit INTERIOR to B's edge.
// B is a 22m-ish square. A has two consecutive vertices dragged onto the
// *interior* of B's left edge (not at B's corners). A's right edge then
// fully lies within B's left edge, but the endpoints of A's edge do NOT
// coincide with B's vertices — which is the real-world snap output.
{
  const A = [
    { latitude: 0, longitude: 0 },
    { latitude: 0.00005, longitude: 0.0002 }, // snapped onto B's left edge
    { latitude: 0.00015, longitude: 0.0002 }, // snapped onto B's left edge
    { latitude: 0.0002, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const B = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  assert(polygonsShareBorder(A, B), "snap-interior: polygonsShareBorder true");
  assert(polygonsTouchOrOverlap(A, B), "snap-interior: polygonsTouchOrOverlap true");
  const merged = unionPolygons(A, B);
  const ok = merged && merged.length >= 5;
  assert(ok, `snap-interior: union non-null (got ${merged ? JSON.stringify(merged.length) : "null"})`);
  if (merged) {
    assert(!hasSelfIntersection(merged), "snap-interior: union is simple");
  }
}

// ── Scenario 3: A's two snap points partially overlap B's edge but extend
// past one of B's vertices — A's snapped edge starts inside B's edge and
// ends past B's corner.
{
  const A = [
    { latitude: 0, longitude: 0 },
    { latitude: 0.00005, longitude: 0.0002 }, // interior of B's left edge
    { latitude: 0.0002, longitude: 0.0002 },  // coincides with B's corner
    { latitude: 0.0002, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const B = [
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0002 },
  ];
  assert(polygonsShareBorder(A, B), "snap-to-corner: polygonsShareBorder true");
  const merged = unionPolygons(A, B);
  assert(merged && merged.length >= 5, `snap-to-corner: union non-null (got ${merged ? merged.length : "null"})`);
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
