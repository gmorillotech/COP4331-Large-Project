/**
 * report-pipeline.spec.ts — Full report submission → processing pipeline tests.
 *
 * Strategy:
 *   - Reports are submitted via page.request (Playwright's API context) using
 *     a real JWT obtained from the /api/test/seed-user endpoint.
 *   - There is no report-submission UI in the frontend, so reports are submitted
 *     directly to the backend API using the request context.
 *   - DB state is verified through the test-only /api/test/* endpoints rather
 *     than connecting to MongoDB directly from tests.
 *   - The A1 polling cycle is triggered on-demand via /api/test/trigger-poll.
 *
 * Coverage:
 *   1.  Report submission stores a document in the DB
 *   2.  Authenticated report has the correct userId
 *   3.  Anonymous report receives userId = "local-user"
 *   4.  StudyLocation currentNoiseLevel/currentOccupancyLevel are updated after poll
 *   5.  LocationGroup aggregate is updated after poll
 *   6.  Multiple reports produce a weighted average on the StudyLocation
 *   7.  Fresh reports stay "live" after immediate poll
 *   8.  ReportTagMetadata is written with weight factors for each report
 *   9.  Location history endpoint returns data after a report is archived
 *  10.  Recent reports endpoint returns submitted report
 *  11.  Validation: missing studyLocationId → 400
 *  12.  Validation: missing avgNoise → 400
 *  13.  All reports visible via test endpoint
 */

import { test, expect, request } from '@playwright/test';
import {
  resetTestData,
  seedTestUser,
  submitReport,
  triggerPollCycle,
  getReportFromDb,
  getLocationFromDb,
  getLocationReportsFromDb,
  getLocationHistory,
  getRecentReports,
} from '../helpers/apiClient.js';
import {
  TEST_USER,
  TEST_USER_2,
  STUDY_LOCATIONS,
  makeReportPayload,
} from '../helpers/seedData.js';

// ── Shared state ──────────────────────────────────────────────────────────────

let api: import('@playwright/test').APIRequestContext;
let userToken: string;
let userId: string;

// ── Hooks ─────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  api = await request.newContext();
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async () => {
  await resetTestData(api);
  const user = await seedTestUser(api, TEST_USER);
  userToken = user.accessToken;
  userId = user.userId;
});

// ── 1. Report stored in DB ────────────────────────────────────────────────────

test('submitted report is stored in the database', async () => {
  const payload = makeReportPayload(STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET);
  const { reportId } = await submitReport(api, userToken, payload);

  const { report } = await getReportFromDb(api, reportId);

  expect(report).not.toBeNull();
  expect(report!.reportId).toBe(reportId);
  expect(report!.studyLocationId).toBe(STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET);
  expect(report!.avgNoise).toBe(payload.avgNoise);
  expect(report!.occupancy).toBe(payload.occupancy);
});

// ── 2. Authenticated userId saved ─────────────────────────────────────────────

test('authenticated report stores the correct userId', async () => {
  const { reportId } = await submitReport(
    api,
    userToken,
    makeReportPayload(STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET),
  );

  const { report } = await getReportFromDb(api, reportId);
  expect(report!.userId).toBe(userId);
});

// ── 3. Anonymous report userId ────────────────────────────────────────────────

test('anonymous report receives userId = "local-user"', async () => {
  const payload = makeReportPayload(STUDY_LOCATIONS.LIBRARY_FLOOR_2_MODERATE);
  // No Authorization header
  const res = await api.post('http://localhost:5050/api/reports', { data: payload });
  expect(res.ok()).toBe(true);
  const body = await res.json() as { report: { reportId: string } };

  const { report } = await getReportFromDb(api, body.report.reportId);
  expect(report!.userId).toBe('local-user');
});

// ── 4. StudyLocation updated after poll ───────────────────────────────────────

test('StudyLocation currentNoiseLevel and currentOccupancyLevel are updated after poll', async () => {
  const locId = STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET;
  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 60, maxNoise: 75, variance: 8, occupancy: 3 }));
  await triggerPollCycle(api);

  const { location } = await getLocationFromDb(api, locId);
  expect(location).not.toBeNull();
  expect(typeof location!.currentNoiseLevel).toBe('number');
  expect(typeof location!.currentOccupancyLevel).toBe('number');
});

// ── 5. LocationGroup aggregate updated ───────────────────────────────────────

test('LocationGroup currentNoiseLevel is updated after a poll cycle', async () => {
  const locId = STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET;
  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 50, maxNoise: 65 }));
  await triggerPollCycle(api);

  const { group } = await getLocationFromDb(api, locId);
  expect(group).not.toBeNull();
  expect(typeof group!.currentNoiseLevel).toBe('number');
});

// ── 6. Multiple reports weighted average ──────────────────────────────────────

test('two reports from different users produce a blended noise level', async () => {
  const locId = STUDY_LOCATIONS.LIBRARY_FLOOR_2_MODERATE;
  const user2 = await seedTestUser(api, TEST_USER_2);

  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 30, maxNoise: 40 }));
  await submitReport(api, user2.accessToken, makeReportPayload(locId, { avgNoise: 80, maxNoise: 90 }));
  await triggerPollCycle(api);

  const { location } = await getLocationFromDb(api, locId);
  expect(location!.currentNoiseLevel).not.toBeNull();

  const avg = location!.currentNoiseLevel!;
  expect(avg).toBeGreaterThan(29);
  expect(avg).toBeLessThan(81);
});

// ── 7. Fresh reports stay "live" ──────────────────────────────────────────────

test('a fresh report is "live" immediately after submission', async () => {
  const { reportId } = await submitReport(
    api,
    userToken,
    makeReportPayload(STUDY_LOCATIONS.LIBRARY_FLOOR_4_EMPTY),
  );

  const { report } = await getReportFromDb(api, reportId);
  expect(report!.reportKind).toBe('live');
});

test('a fresh report remains "live" after the first poll cycle', async () => {
  const { reportId } = await submitReport(
    api,
    userToken,
    makeReportPayload(STUDY_LOCATIONS.STUDENT_UNION_FOOD_COURT),
  );
  await triggerPollCycle(api);

  const { report } = await getReportFromDb(api, reportId);
  expect(report!.reportKind).toBe('live');
});

// ── 8. ReportTagMetadata weight factors written ───────────────────────────────

test('ReportTagMetadata is created with noise and occupancy weight factors', async () => {
  const { reportId } = await submitReport(
    api,
    userToken,
    makeReportPayload(STUDY_LOCATIONS.LIBRARY_FLOOR_3_BUSY),
  );
  await triggerPollCycle(api);

  const { metadata } = await getReportFromDb(api, reportId);
  expect(metadata).not.toBeNull();
  expect(typeof metadata!.noiseWeightFactor).toBe('number');
  expect(typeof metadata!.occupancyWeightFactor).toBe('number');
  expect(metadata!.noiseWeightFactor).toBeGreaterThan(0);
});

// ── 9. Location history endpoint ──────────────────────────────────────────────

test('location history endpoint responds after report submission', async () => {
  const locId = STUDY_LOCATIONS.MSB_FLOOR_2_MODERATE;
  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 45, maxNoise: 55 }));
  await triggerPollCycle(api);

  const history = await getLocationHistory(api, userToken, locId);
  expect(history).toBeDefined();
  expect(history).not.toBeNull();
});

// ── 10. Recent reports endpoint ───────────────────────────────────────────────

test('GET /api/reports/recent returns the submitted report', async () => {
  const locId = STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET;
  await submitReport(api, userToken, makeReportPayload(locId));

  const reports = await getRecentReports(api, userToken);
  expect(Array.isArray(reports)).toBe(true);
  const locationIds = reports.map((r) => r.studyLocationId);
  expect(locationIds).toContain(locId);
});

// ── 11. Validation: missing studyLocationId ───────────────────────────────────

test('submitting a report without studyLocationId returns 400', async () => {
  const res = await api.post('http://localhost:5050/api/reports', {
    data: { avgNoise: 50, maxNoise: 60, variance: 5, occupancy: 2 },
    headers: { Authorization: `Bearer ${userToken}` },
  });
  expect(res.status()).toBe(400);
});

// ── 12. Validation: missing avgNoise ─────────────────────────────────────────

test('submitting a report without avgNoise returns 400', async () => {
  const res = await api.post('http://localhost:5050/api/reports', {
    data: { studyLocationId: STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET, maxNoise: 60, variance: 5, occupancy: 2 },
    headers: { Authorization: `Bearer ${userToken}` },
  });
  expect(res.status()).toBe(400);
});

// ── 13. All reports visible via test endpoint ─────────────────────────────────

test('GET /api/test/reports/:locId returns all submitted reports', async () => {
  const locId = STUDY_LOCATIONS.LIBRARY_FLOOR_1_QUIET;
  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 30, maxNoise: 40 }));
  await submitReport(api, userToken, makeReportPayload(locId, { avgNoise: 70, maxNoise: 80 }));

  const { reports } = await getLocationReportsFromDb(api, locId);
  expect(reports.length).toBe(2);
  const noiseLevels = reports.map((r) => r.avgNoise).sort((a, b) => a - b);
  expect(noiseLevels).toEqual([30, 70]);
});
