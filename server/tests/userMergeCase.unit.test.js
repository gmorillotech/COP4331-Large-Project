/**
 * Regression test for the user-reported merge failure
 * ("Groups share geometry but a clean merged polygon could not be produced").
 *
 * Both polygons are the exact coordinates from the failing production request.
 * Before the segmentIntersectionPoints endpoint-snap fix, unionPolygons
 * returned null because lineIntersection produced float-drifted near-duplicate
 * vertices at the shared corners (drift ~1e-9 deg), and pointKey's 12-digit
 * precision kept them as distinct graph nodes → stitchSegmentsToPolygon
 * rejected them for having degree != 2.
 */

const {
  unionPolygons,
  polygonsShareBorder,
  polygonsTouchOrOverlap,
  hasSelfIntersection,
} = require("../services/geometryValidation");

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`PASS ${name}`); passed++; }
  else { console.log(`FAIL ${name}`); failed++; }
}

const polyA = [
  { latitude: 28.60071486689389, longitude: -81.19706590993611 },
  { latitude: 28.60077856241199, longitude: -81.19693231429365 },
  { latitude: 28.60121777907947, longitude: -81.19676580355453 },
  { latitude: 28.60157184506425, longitude: -81.19668075920788 },
  { latitude: 28.60164490079727, longitude: -81.19756551103193 },
  { latitude: 28.601006232115974, longitude: -81.19772867423924 },
  { latitude: 28.60071486689389, longitude: -81.19706590993611 },
];

const polyB = [
  { latitude: 28.600345687969693, longitude: -81.1980777339048 },
  { latitude: 28.600457246227403, longitude: -81.1979009683721 },
  { latitude: 28.600427052172027, longitude: -81.19768318271596 },
  { latitude: 28.6003976066008, longitude: -81.19764021534561 },
  { latitude: 28.600363008362173, longitude: -81.19763441681916 },
  { latitude: 28.600297246958707, longitude: -81.19759151968523 },
  { latitude: 28.600237743971963, longitude: -81.1973931073651 },
  { latitude: 28.60071486689389, longitude: -81.19706590993611 },
  { latitude: 28.600847624147917, longitude: -81.19736789096295 },
  { latitude: 28.601006232115974, longitude: -81.19772867423924 },
  { latitude: 28.600805463969223, longitude: -81.1978177188605 },
  { latitude: 28.600771599213218, longitude: -81.19819747006804 },
  { latitude: 28.600594522965537, longitude: -81.19846510381511 },
  { latitude: 28.600482426395313, longitude: -81.19835700874785 },
  { latitude: 28.600332334262117, longitude: -81.19813639627468 },
  { latitude: 28.600345687969693, longitude: -81.1980777339048 },
];

assert(polygonsShareBorder(polyA, polyB), "regression: polygonsShareBorder true");
assert(polygonsTouchOrOverlap(polyA, polyB), "regression: polygonsTouchOrOverlap true");

const merged = unionPolygons(polyA, polyB);
assert(merged !== null, "regression: unionPolygons returns non-null");
assert(merged && merged.length >= 5, `regression: merged has enough vertices (got ${merged ? merged.length : "null"})`);
if (merged) {
  assert(!hasSelfIntersection(merged), "regression: merged is simple");
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
