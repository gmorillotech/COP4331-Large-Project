const assert = require("node:assert/strict");

const {
  isClosedPolygon,
  polygonsTouchOrOverlap,
  polygonsHaveAreaOverlap,
  polygonsShareBorder,
  unionPolygons,
  distanceMeters,
  polygonCentroidOpenRing,
  polygonEdges,
  buildMergeCorridor,
  findAdjacentMergeCandidate,
  validatePolygon,
  hasSelfIntersection,
} = require("../services/geometryValidation");

const registeredTests = [];
function it(name, run) {
  registeredTests.push({ name, run });
}

// Helpers ─────────────────────────────────────────────────────────────────────

// 1 meter at ~28.6 degrees latitude (UCF) corresponds to roughly:
//   dLat = 1 / 111320   ≈ 8.98e-6
//   dLng = 1 / (111320 * cos(28.6°)) ≈ 1.023e-5
const M_PER_DEG_LAT = 111320;
const BASE_LAT = 28.6;
const M_PER_DEG_LNG = 111320 * Math.cos((BASE_LAT * Math.PI) / 180);
const metersLat = (m) => m / M_PER_DEG_LAT;
const metersLng = (m) => m / M_PER_DEG_LNG;

function rect(minLat, minLng, maxLat, maxLng) {
  return [
    { latitude: minLat, longitude: minLng },
    { latitude: maxLat, longitude: minLng },
    { latitude: maxLat, longitude: maxLng },
    { latitude: minLat, longitude: maxLng },
    { latitude: minLat, longitude: minLng },
  ];
}

// Two 20m squares sitting side-by-side with a configurable gap (meters).
// Polygon A occupies longitudes [0, 20m); Polygon B occupies longitudes [20m + gap, 40m + gap).
function makeSideBySideSquares(gapMeters) {
  const sizeLat = metersLat(20);
  const sizeLngSquare = metersLng(20);
  const gapLng = metersLng(gapMeters);

  const a = rect(BASE_LAT, 0, BASE_LAT + sizeLat, sizeLngSquare);
  const b = rect(
    BASE_LAT,
    sizeLngSquare + gapLng,
    BASE_LAT + sizeLat,
    sizeLngSquare * 2 + gapLng,
  );
  return { a, b };
}

// ── distanceMeters ────────────────────────────────────────────────────────────

it("distanceMeters: 1 meter north/south is ~1 meter", () => {
  const a = { latitude: BASE_LAT, longitude: 0 };
  const b = { latitude: BASE_LAT + metersLat(1), longitude: 0 };
  const d = distanceMeters(a, b);
  assert.ok(Math.abs(d - 1) < 0.01, `expected ~1m, got ${d}`);
});

it("distanceMeters: 5 meters east/west is ~5 meters", () => {
  const a = { latitude: BASE_LAT, longitude: 0 };
  const b = { latitude: BASE_LAT, longitude: metersLng(5) };
  const d = distanceMeters(a, b);
  assert.ok(Math.abs(d - 5) < 0.05, `expected ~5m, got ${d}`);
});

// ── polygonCentroidOpenRing ───────────────────────────────────────────────────

it("polygonCentroidOpenRing: centroid of unit square equals its center", () => {
  const { vertices } = isClosedPolygon([
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
    { latitude: 1, longitude: 1 },
    { latitude: 0, longitude: 1 },
  ]);
  const c = polygonCentroidOpenRing(vertices);
  assert.ok(Math.abs(c.latitude - 0.5) < 1e-9);
  assert.ok(Math.abs(c.longitude - 0.5) < 1e-9);
});

// ── polygonEdges ──────────────────────────────────────────────────────────────

it("polygonEdges: rectangle yields 4 edges", () => {
  const poly = rect(0, 0, 1, 1);
  assert.equal(polygonEdges(poly).length, 4);
});

// ── buildMergeCorridor ────────────────────────────────────────────────────────

it("buildMergeCorridor: facing parallel edges build a simple quad", () => {
  const edgeA = [
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];
  const edgeB = [
    { latitude: 0, longitude: 2 },
    { latitude: 1, longitude: 2 },
  ];
  const corridor = buildMergeCorridor(edgeA, edgeB);
  assert.ok(corridor, "expected a corridor");
  assert.equal(hasSelfIntersection(corridor), false);
});

it("buildMergeCorridor: reversed edgeB still produces a simple quad", () => {
  const edgeA = [
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];
  // Reversed order (would self-intersect if used directly)
  const edgeB = [
    { latitude: 1, longitude: 2 },
    { latitude: 0, longitude: 2 },
  ];
  const corridor = buildMergeCorridor(edgeA, edgeB);
  assert.ok(corridor, "expected a corridor via reversal");
  assert.equal(hasSelfIntersection(corridor), false);
});

// ── findAdjacentMergeCandidate ────────────────────────────────────────────────

it("adjacency: borders that already share an edge are rejected (gap=0)", () => {
  const { a, b } = makeSideBySideSquares(0);
  // Sanity: original strict path already accepts these.
  assert.equal(polygonsTouchOrOverlap(a, b), true);
  // Adjacency path should find no corridor (gap is zero).
  const candidate = findAdjacentMergeCandidate(a, b, [], 10);
  assert.equal(candidate, null);
});

it("adjacency: small valid gap produces a valid merged polygon", () => {
  const { a, b } = makeSideBySideSquares(3);
  assert.equal(polygonsTouchOrOverlap(a, b), false);

  const candidate = findAdjacentMergeCandidate(a, b, [], 10);
  assert.ok(candidate, "expected a candidate for a 3m gap");
  assert.ok(Math.abs(candidate.gapMeters - 3) < 0.05);
  assert.equal(hasSelfIntersection(candidate.mergedPolygon), false);

  // Merged polygon must contain original centroids
  const validation = validatePolygon(candidate.mergedPolygon, [], []);
  assert.equal(validation.valid, true, validation.errors.join(" | "));
});

it("adjacency: gap larger than maxGapMeters is rejected", () => {
  const { a, b } = makeSideBySideSquares(25);
  const candidate = findAdjacentMergeCandidate(a, b, [], 10);
  assert.equal(candidate, null);
});

it("adjacency: third group occupying the corridor blocks the merge", () => {
  const { a, b } = makeSideBySideSquares(8);
  // Third polygon sits inside the gap, centered on the same latitude band.
  const sizeLat = metersLat(20);
  const interloper = rect(
    BASE_LAT + metersLat(2),
    metersLng(21),
    BASE_LAT + sizeLat - metersLat(2),
    metersLng(27),
  );
  const candidate = findAdjacentMergeCandidate(a, b, [interloper], 15);
  assert.equal(candidate, null);
});

it("adjacency: third group outside the corridor does not block the merge", () => {
  const { a, b } = makeSideBySideSquares(4);
  // Third polygon far north of the gap — must not interfere.
  const farAway = rect(
    BASE_LAT + metersLat(500),
    metersLng(500),
    BASE_LAT + metersLat(520),
    metersLng(520),
  );
  const candidate = findAdjacentMergeCandidate(a, b, [farAway], 10);
  assert.ok(candidate, "expected a candidate when third group is unrelated");
});

it("adjacency: merged polygon still passes validatePolygon against others", () => {
  const { a, b } = makeSideBySideSquares(4);
  const candidate = findAdjacentMergeCandidate(a, b, [], 10);
  assert.ok(candidate);
  const validation = validatePolygon(candidate.mergedPolygon, [], []);
  assert.equal(validation.valid, true, validation.errors.join(" | "));
});

it("adjacency: merged polygon is rejected against an overlapping third group", () => {
  const { a, b } = makeSideBySideSquares(4);
  const candidate = findAdjacentMergeCandidate(a, b, [], 10);
  assert.ok(candidate);
  // Other group that overlaps polygon A's interior should fail validation
  const overlapping = rect(
    BASE_LAT + metersLat(5),
    metersLng(5),
    BASE_LAT + metersLat(15),
    metersLng(15),
  );
  const validation = validatePolygon(candidate.mergedPolygon, [overlapping], []);
  assert.equal(validation.valid, false);
});

// ── preservation: strict path still behaves the same ──────────────────────────

it("preservation: exactly-touching borders still merge via the strict union path", () => {
  const { a, b } = makeSideBySideSquares(0);
  assert.equal(polygonsShareBorder(a, b), true);
  const merged = unionPolygons(a, b);
  assert.ok(merged, "expected a union polygon");
  assert.equal(hasSelfIntersection(merged), false);
});

it("preservation: overlapping polygons still union correctly", () => {
  const a = rect(0, 0, 2, 2);
  const b = rect(1, 1, 3, 3);
  assert.equal(polygonsHaveAreaOverlap(a, b), true);
  const merged = unionPolygons(a, b);
  assert.ok(merged);
  assert.equal(hasSelfIntersection(merged), false);
});

// ── runner ────────────────────────────────────────────────────────────────────

void run();

async function run() {
  let failures = 0;
  for (const testCase of registeredTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error.message}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures}/${registeredTests.length} tests failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${registeredTests.length} adjacent-merge unit tests passed.`);
}
