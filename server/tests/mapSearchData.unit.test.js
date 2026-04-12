const assert = require("node:assert/strict");

const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");
const T = SERVER_RUNTIME_CONFIG.display.noiseThresholds; // quiet, moderate, busy, loud

const {
  toNoiseBand,
  buildMapMarkerState,
  isRecentReading,
} = require("../services/mapSearchData");

const registeredTests = [];

function it(name, run) {
  registeredTests.push({ name, run });
}

// ── toNoiseBand ──────────────────────────────────────────────────────────────
// Thresholds come from SERVER_RUNTIME_CONFIG (env vars or defaults: 50/60/72/80).

it(`toNoiseBand: < ${T.quiet} dB → band 1`, () => {
  assert.equal(toNoiseBand(0), 1);
  assert.equal(toNoiseBand(T.quiet - 1), 1);
  assert.equal(toNoiseBand(T.quiet - 0.01), 1);
});

it(`toNoiseBand: ${T.quiet}–${T.moderate - 1} dB → band 2`, () => {
  assert.equal(toNoiseBand(T.quiet), 2);
  assert.equal(toNoiseBand(T.quiet + 1), 2);
  assert.equal(toNoiseBand(T.moderate - 0.01), 2);
});

it(`toNoiseBand: ${T.moderate}–${T.busy - 1} dB → band 3`, () => {
  assert.equal(toNoiseBand(T.moderate), 3);
  assert.equal(toNoiseBand(T.moderate + 1), 3);
  assert.equal(toNoiseBand(T.busy - 0.01), 3);
});

it(`toNoiseBand: ${T.busy}–${T.loud - 1} dB → band 4`, () => {
  assert.equal(toNoiseBand(T.busy), 4);
  assert.equal(toNoiseBand(T.busy + 1), 4);
  assert.equal(toNoiseBand(T.loud - 0.01), 4);
});

it(`toNoiseBand: ≥ ${T.loud} dB → band 5`, () => {
  assert.equal(toNoiseBand(T.loud), 5);
  assert.equal(toNoiseBand(T.loud + 10), 5);
  assert.equal(toNoiseBand(120), 5);
});

it("toNoiseBand: boundary values at exact thresholds", () => {
  assert.equal(toNoiseBand(T.quiet - 0.001), 1);
  assert.equal(toNoiseBand(T.quiet),          2);
  assert.equal(toNoiseBand(T.moderate - 0.001), 2);
  assert.equal(toNoiseBand(T.moderate),         3);
  assert.equal(toNoiseBand(T.busy - 0.001), 3);
  assert.equal(toNoiseBand(T.busy),          4);
  assert.equal(toNoiseBand(T.loud - 0.001), 4);
  assert.equal(toNoiseBand(T.loud),          5);
});

it("toNoiseBand: null / undefined / NaN → null", () => {
  assert.equal(toNoiseBand(null), null);
  assert.equal(toNoiseBand(undefined), null);
  assert.equal(toNoiseBand(NaN), null);
  assert.equal(toNoiseBand("55"), null);   // string — not a finite number
  assert.equal(toNoiseBand(Infinity), null);
});

// ── isRecentReading ──────────────────────────────────────────────────────────

it("isRecentReading: null updatedAt → false", () => {
  assert.equal(isRecentReading(null, 5), false);
  assert.equal(isRecentReading(undefined, 5), false);
});

it("isRecentReading: fresh timestamp → true", () => {
  const now = new Date().toISOString();
  assert.equal(isRecentReading(now, 5), true);
});

it("isRecentReading: timestamp just inside window → true", () => {
  const justInside = new Date(Date.now() - 4 * 60 * 1000).toISOString(); // 4 min ago, window=5
  assert.equal(isRecentReading(justInside, 5), true);
});

it("isRecentReading: timestamp just outside window → false", () => {
  const justOutside = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 min ago, window=5
  assert.equal(isRecentReading(justOutside, 5), false);
});

// ── buildMapMarkerState ──────────────────────────────────────────────────────

it("buildMapMarkerState: fresh + valid noise → isAnimated true, correct band", () => {
  const now = new Date().toISOString();
  // Use a value known to be band 3 (between moderate and busy thresholds)
  const midBand3 = T.moderate + 1;
  const state = buildMapMarkerState(now, midBand3, 5);
  assert.equal(state.isAnimated, true);
  assert.equal(state.noiseBand, 3);
  assert.equal(state.hasRecentData, true);
  assert.ok(state.updatedAtIso);
});

it("buildMapMarkerState: stale data → isAnimated false, noiseBand still returned", () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
  const midBand3 = T.moderate + 1;
  const state = buildMapMarkerState(old, midBand3, 5);              // 5-min window
  assert.equal(state.isAnimated, false);
  assert.equal(state.noiseBand, 3);   // band preserved — value doesn't expire
  assert.equal(state.hasRecentData, false);
});

it("buildMapMarkerState: null updatedAt → all false/null", () => {
  const state = buildMapMarkerState(null, null, 5);
  assert.equal(state.isAnimated, false);
  assert.equal(state.noiseBand, null);
  assert.equal(state.hasRecentData, false);
  assert.equal(state.updatedAtIso, null);
});

it("buildMapMarkerState: fresh but null noiseLevel → isAnimated false", () => {
  const now = new Date().toISOString();
  const state = buildMapMarkerState(now, null, 5);
  assert.equal(state.isAnimated, false);   // Number.isFinite(null) = false
  assert.equal(state.noiseBand, null);
  assert.equal(state.hasRecentData, true); // timestamp is fresh
});

it("buildMapMarkerState: fresh + each band boundary produces correct noiseBand", () => {
  const now = new Date().toISOString();
  // Use the lower bound of each band (== the threshold value)
  const cases = [
    [T.quiet - 1,    1],
    [T.quiet,        2],
    [T.moderate,     3],
    [T.busy,         4],
    [T.loud,         5],
  ];
  for (const [db, expectedBand] of cases) {
    const state = buildMapMarkerState(now, db, 60);
    assert.equal(state.noiseBand, expectedBand, `dB=${db} should be band ${expectedBand}`);
    assert.equal(state.isAnimated, true, `dB=${db} should be animated`);
  }
});

it("buildMapMarkerState: updatedAtIso is ISO string when updatedAt provided", () => {
  const input = "2026-01-15T10:00:00.000Z";
  const state = buildMapMarkerState(input, 45, 60);
  assert.equal(state.updatedAtIso, "2026-01-15T10:00:00.000Z");
});

// ── runner ───────────────────────────────────────────────────────────────────

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
  console.log(`\nAll ${registeredTests.length} mapSearchData unit tests passed.`);
}
