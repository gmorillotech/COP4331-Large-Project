/**
 * Unit tests for subtractPolygon — used by location group creation to cede
 * contested area to pre-existing groups when auto-generating the hexagon
 * boundary for a new group.
 */

const {
  subtractPolygon,
  pointInPolygon,
  hasSelfIntersection,
} = require("../services/geometryValidation");

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`PASS ${name}`); passed++; }
  else { console.log(`FAIL ${name}`); failed++; }
}

// ── Test 1: clip punches a corner out of subject → returned polygon
// excludes the clipped area but includes the rest of subject.
{
  const subject = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  // Clip overlaps subject's top-right corner
  const clip = [
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0006 },
    { latitude: 0.0006, longitude: 0.0006 },
    { latitude: 0.0006, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
  ];
  const result = subtractPolygon(subject, clip);
  assert(result !== null, "corner-clip: subtract returns non-null");
  if (result) {
    assert(!hasSelfIntersection(result), "corner-clip: result is simple");
    // A point in the clipped area should NOT be inside the result
    const insideClip = { latitude: 0.0003, longitude: 0.0003 };
    assert(!pointInPolygon(insideClip, result), "corner-clip: clipped region excluded");
    // A point clearly in subject but outside clip SHOULD still be inside result
    const inSubjectOnly = { latitude: 0.0001, longitude: 0.0001 };
    assert(pointInPolygon(inSubjectOnly, result), "corner-clip: non-contested area preserved");
  }
}

// ── Test 2: subject entirely outside clip → subtract is a no-op shape.
// (stitchSegmentsToPolygon may return null in this case because the output
// would be the untouched subject but the segment set isn't structurally the
// closed subject ring; the caller falls back to the original polygon.)
{
  const subject = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const clip = [
    { latitude: 0.001, longitude: 0.001 },
    { latitude: 0.001, longitude: 0.002 },
    { latitude: 0.002, longitude: 0.002 },
    { latitude: 0.002, longitude: 0.001 },
    { latitude: 0.001, longitude: 0.001 },
  ];
  const result = subtractPolygon(subject, clip);
  // Either the original ring or null — both are acceptable since the caller
  // keeps the previous polygon if subtractPolygon returns null/invalid.
  if (result === null) {
    assert(true, "no-overlap: returns null (caller keeps original)");
  } else {
    assert(result.length >= 4, "no-overlap: returns a valid ring");
    const inside = { latitude: 0.0001, longitude: 0.0001 };
    assert(pointInPolygon(inside, result), "no-overlap: subject interior preserved");
  }
}

// ── Test 3: clip fully contains subject → subtract returns null
// (nothing is left).
{
  const subject = [
    { latitude: 0.0001, longitude: 0.0001 },
    { latitude: 0.0001, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0002 },
    { latitude: 0.0002, longitude: 0.0001 },
    { latitude: 0.0001, longitude: 0.0001 },
  ];
  const clip = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0.0004 },
    { latitude: 0.0004, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ];
  const result = subtractPolygon(subject, clip);
  assert(result === null, "fully-contained: returns null (no area remains)");
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
