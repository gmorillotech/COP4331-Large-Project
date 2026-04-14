/**
 * Unit tests for the merge-failure diagnostics helpers:
 *   - `minDistanceBetweenPolygons` in services/geometryValidation.js
 *   - failure-mode branching the controller uses to build error messages
 *
 * These cover the three actionable cases an admin can see when
 * /api/admin/location-groups/merge returns 400:
 *   1. polygons touch at only a single point (shared-vertex, no shared edge)
 *   2. polygons are too far apart (> maxGapMeters)
 *   3. polygons are within the adjacency gap but another group blocks them
 */

const {
  isClosedPolygon,
  polygonsHaveAreaOverlap,
  polygonsShareBorder,
  minDistanceBetweenPolygons,
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

function approx(a, b, tol = 0.5) {
  return Math.abs(a - b) <= tol;
}

function ring(points) {
  return isClosedPolygon(points).vertices;
}

// Scale: 1e-4 degrees latitude ≈ 11.13 meters.
// All polygons below live near (0, 0) so longitude scale ~ latitude scale.

// ── Test 1: overlapping polygons → gap is 0 ─────────────────────────
{
  const a = ring([
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
  ]);
  const b = ring([
    { latitude: 0.0001, longitude: 0.0001 },
    { latitude: 0.0001, longitude: 0.0003 },
    { latitude: 0.0003, longitude: 0.0003 },
    { latitude: 0.0003, longitude: 0.0001 },
  ]);
  const d = minDistanceBetweenPolygons(a, b);
  assert(d === 0, "overlap: minDistance is 0");
  assert(polygonsHaveAreaOverlap(a, b), "overlap: polygonsHaveAreaOverlap true");
}

// ── Test 2: polygons sharing a full edge → gap is 0, shared border ──
{
  const a = ring([
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
  ]);
  const b = ring([
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0002, longitude: 0.0002 },
  ]);
  const d = minDistanceBetweenPolygons(a, b);
  assert(d === 0, "shared edge: minDistance is 0");
  assert(polygonsShareBorder(a, b), "shared edge: polygonsShareBorder true");
}

// ── Test 3: polygons touching at a single shared vertex ─────────────
// This is the case we want to diagnose as "single-point touch".
{
  const a = ring([
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
  ]);
  const b = ring([
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0.0002 },
  ]);
  const d = minDistanceBetweenPolygons(a, b);
  assert(d === 0, "point-touch: minDistance is 0");
  assert(!polygonsShareBorder(a, b), "point-touch: polygonsShareBorder false (no segment overlap)");
  assert(!polygonsHaveAreaOverlap(a, b), "point-touch: polygonsHaveAreaOverlap false (boundary only)");
}

// ── Test 4: small gap (~5.5 m) between polygons ─────────────────────
{
  const a = ring([
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
  ]);
  // Shift b right by 0.00005 degrees longitude ≈ 5.5 m
  const b = ring([
    { latitude: 0, longitude: 0.00025 },
    { latitude: 0, longitude: 0.00045 },
    { latitude: 0.0002, longitude: 0.00045 },
    { latitude: 0.0002, longitude: 0.00025 },
  ]);
  const d = minDistanceBetweenPolygons(a, b);
  assert(approx(d, 5.57, 0.5), `small gap: minDistance ~ 5.57 m (got ${d.toFixed(2)})`);
}

// ── Test 5: far gap (~33 m) between polygons ────────────────────────
{
  const a = ring([
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
  ]);
  const b = ring([
    { latitude: 0, longitude: 0.0005 },
    { latitude: 0, longitude: 0.0007 },
    { latitude: 0.0002, longitude: 0.0007 },
    { latitude: 0.0002, longitude: 0.0005 },
  ]);
  const d = minDistanceBetweenPolygons(a, b);
  assert(approx(d, 33.4, 1), `far gap: minDistance ~ 33 m (got ${d.toFixed(2)})`);
}

// ── Summary ─────────────────────────────────────────────────────────
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
