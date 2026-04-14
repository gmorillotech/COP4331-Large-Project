const { A1Service, defaultA1Config } = require("../../shared/src/uml_service_layout");

const repos = {
  report: { getAllReportsWithMetadata: async () => [], upsertReportMetadata: async () => {}, deleteReports: async () => {} },
  user: { findUsersByIds: async () => [], updateUser: async () => {} },
  sl: { getAllStudyLocations: async () => [], bulkUpdateStudyLocations: async () => {}, updateStudyLocation: async () => {} },
  lg: { getAllLocationGroups: async () => [], bulkUpdateLocationGroups: async () => {}, updateLocationGroup: async () => {} },
};
const svc = new A1Service(repos.report, repos.user, repos.sl, repos.lg, { ...defaultA1Config, groupFreshnessWindowMs: 12 * 60 * 60 * 1000 });

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`PASS ${msg}`); }
  else { failed++; console.log(`FAIL ${msg}`); }
}

// ============================================================
// Scenario 1: Full lifecycle — submit, populate, decay, preserve, blank
// ============================================================
console.log("\n=== Scenario 1: Full 12h+ lifecycle ===");
const loc1 = { studyLocationId: "loc-1", locationGroupId: "g1", currentNoiseLevel: null, currentOccupancyLevel: null, updatedAt: null };
const submittedAt = new Date("2026-04-14T12:00:00Z");
const report = { report: { studyLocationId: "loc-1", avgNoise: 45, occupancy: 3 }, metadata: { noiseWeightFactor: 1, occupancyWeightFactor: 1, decayFactor: 1 }, user: { userNoiseWF: 1, userOccupancyWF: 1 }};

// T+1min: report populates aggregate
let [r] = svc.recalculateAllStudyLocations([loc1], [report], new Date("2026-04-14T12:01:00Z"));
assert(r.currentNoiseLevel === 45 && r.currentOccupancyLevel === 3, "T+1min: populated with report values");
Object.assign(loc1, r); // simulate DB write

// T+22min: zero-weight edge case (the prod bug)
[r] = svc.recalculateAllStudyLocations([loc1], [{ ...report, metadata: { noiseWeightFactor: 0, occupancyWeightFactor: 0, decayFactor: 0.99 }}], new Date("2026-04-14T12:22:00Z"));
assert(r.currentNoiseLevel === 45 && r.currentOccupancyLevel === 3, "T+22min zero-weight: preserve populated values");
Object.assign(loc1, r);

// T+1h: no active records
[r] = svc.recalculateAllStudyLocations([loc1], [], new Date("2026-04-14T13:00:00Z"));
assert(r.currentNoiseLevel === 45 && r.currentOccupancyLevel === 3, "T+1h no records (inside 12h window): preserve");
Object.assign(loc1, r);

// T+11h59m: still inside window
[r] = svc.recalculateAllStudyLocations([loc1], [], new Date("2026-04-14T23:59:00Z"));
assert(r.currentNoiseLevel === 45 && r.currentOccupancyLevel === 3, "T+11h59m (still inside window): preserve");

// T+12h01m: past window — blank
[r] = svc.recalculateAllStudyLocations([loc1], [], new Date("2026-04-15T00:02:00Z"));
assert(r.currentNoiseLevel === null && r.currentOccupancyLevel === null, "T+12h01m (past window): blank correctly");

// ============================================================
// Scenario 2: Multiple reports aggregate correctly
// ============================================================
console.log("\n=== Scenario 2: Multi-report weighted aggregation ===");
const loc2 = { studyLocationId: "loc-2", locationGroupId: "g1", currentNoiseLevel: null, currentOccupancyLevel: null, updatedAt: new Date() };
const r1 = { report: { studyLocationId: "loc-2", avgNoise: 40, occupancy: 2 }, metadata: { noiseWeightFactor: 1, occupancyWeightFactor: 1 }, user: {} };
const r2 = { report: { studyLocationId: "loc-2", avgNoise: 60, occupancy: 4 }, metadata: { noiseWeightFactor: 1, occupancyWeightFactor: 1 }, user: {} };
[r] = svc.recalculateAllStudyLocations([loc2], [r1, r2], new Date());
assert(r.currentNoiseLevel === 50 && r.currentOccupancyLevel === 3, "Two equal-weight reports average to 50/3");

const r3 = { report: { studyLocationId: "loc-2", avgNoise: 80, occupancy: 5 }, metadata: { noiseWeightFactor: 3, occupancyWeightFactor: 3 }, user: {} };
[r] = svc.recalculateAllStudyLocations([loc2], [r1, r3], new Date());
assert(Math.abs(r.currentNoiseLevel - 70) < 0.01 && Math.abs(r.currentOccupancyLevel - 4.25) < 0.01, "Weighted (1:3) aggregation: 70dB, 4.25 occ");

// ============================================================
// Scenario 3: Only one dimension has zero weight
// ============================================================
console.log("\n=== Scenario 3: One-dimension zero weight ===");
const loc3 = { studyLocationId: "loc-3", locationGroupId: "g1", currentNoiseLevel: 50, currentOccupancyLevel: 3, updatedAt: new Date() };
const mixed = { report: { studyLocationId: "loc-3", avgNoise: 55, occupancy: 4 }, metadata: { noiseWeightFactor: 1, occupancyWeightFactor: 0 }, user: {} };
[r] = svc.recalculateAllStudyLocations([loc3], [mixed], new Date());
assert(r.currentNoiseLevel === 55, "Mixed: noise recomputes");
assert(r.currentOccupancyLevel === 3, "Mixed: occupancy preserves prior (zero-weight dim)");

// ============================================================
// Scenario 4: updatedAt type coercion (the original Bug B)
// ============================================================
console.log("\n=== Scenario 4: updatedAt type variants ===");
const loc4Base = { studyLocationId: "loc-4", locationGroupId: "g1", currentNoiseLevel: 45, currentOccupancyLevel: 3 };
const now4 = new Date("2026-04-14T12:10:00Z");
const prior = "2026-04-14T12:09:00Z"; // ISO string

[r] = svc.recalculateAllStudyLocations([{ ...loc4Base, updatedAt: prior }], [], now4);
assert(r.currentNoiseLevel === 45, "ISO-string updatedAt inside window: preserve");

[r] = svc.recalculateAllStudyLocations([{ ...loc4Base, updatedAt: new Date(prior).getTime() }], [], now4);
assert(r.currentNoiseLevel === 45, "Number-ms updatedAt inside window: preserve");

[r] = svc.recalculateAllStudyLocations([{ ...loc4Base, updatedAt: null }], [], now4);
assert(r.currentNoiseLevel === null, "Null updatedAt: correctly blank (no prior to preserve)");

// ============================================================
// Scenario 5: LocationGroup aggregation preserves when children fresh
// ============================================================
console.log("\n=== Scenario 5: LocationGroup preservation ===");
const group = { locationGroupId: "g1", currentNoiseLevel: 50, currentOccupancyLevel: 3, updatedAt: new Date("2026-04-14T12:00:00Z") };
const freshChild = { studyLocationId: "c1", locationGroupId: "g1", currentNoiseLevel: 45, currentOccupancyLevel: 3, updatedAt: new Date("2026-04-14T12:05:00Z") };
const staleChild = { studyLocationId: "c2", locationGroupId: "g1", currentNoiseLevel: null, currentOccupancyLevel: null, updatedAt: null };

const [gResult] = svc.recalculateAllLocationGroups([group], [freshChild, staleChild], new Date("2026-04-14T12:10:00Z"));
assert(gResult.currentNoiseLevel === 45, "Group aggregates from fresh child only");

const [gResult2] = svc.recalculateAllLocationGroups([group], [staleChild], new Date("2026-04-14T14:00:00Z"));
assert(gResult2.currentNoiseLevel === 50 && gResult2.currentOccupancyLevel === 3, "Group: no fresh children, preserve prior values");

// ============================================================
// Scenario 6: Regression — admin delete shouldn't blank (covered by service, but test recalc path directly)
// ============================================================
console.log("\n=== Scenario 6: Recalc after report decay (admin-delete equivalent) ===");
const loc6 = { studyLocationId: "loc-6", locationGroupId: "g1", currentNoiseLevel: 45, currentOccupancyLevel: 3, updatedAt: new Date("2026-04-14T12:00:00Z") };
// Simulate: reports got deleted (admin or decay), now 0 records
[r] = svc.recalculateAllStudyLocations([loc6], [], new Date("2026-04-14T12:05:00Z"));
assert(r.currentNoiseLevel === 45 && r.currentOccupancyLevel === 3, "After reports gone (inside window): preserve");

// ============================================================
// Summary
// ============================================================
console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
