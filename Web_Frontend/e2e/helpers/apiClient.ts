/**
 * apiClient.ts — Typed HTTP helpers for E2E tests.
 *
 * All calls go directly to the backend (http://localhost:5050) so they are
 * independent of the Vite dev-server proxy and work even when the browser
 * page has not navigated anywhere yet.
 */

import { APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:5050';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedUserPayload {
  login: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

export interface SeedUserResponse {
  userId: string;
  login: string;
  email: string;
  role: string;
  accessToken: string;
}

// Admin-facing user shape returned by GET /api/admin/users
export interface AdminUserRecord {
  userId: string;
  displayName: string;
  email: string;
  trustScore: number;
  role: string;
  accountStatus: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface ReportPayload {
  studyLocationId: string;
  avgNoise: number;    // 0–100 dB
  maxNoise: number;    // 0–100 dB, >= avgNoise
  variance: number;   // >= 0
  occupancy: number;  // 1–5
}

export interface SubmitReportResponse {
  reportId: string;
  studyLocationId: string;
  userId: string;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  occupancy: number;
  reportKind: string;
}

export interface DbReport {
  reportId: string;
  studyLocationId: string;
  userId: string;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  occupancy: number;
  reportKind: string;
  createdAt: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface DbReportTagMetadata {
  reportId: string;
  decayFactor: number;
  varianceCorrectionWF: number;
  sessionCorrectionNoiseWF: number;
  noiseWeightFactor: number;
  occupancyWeightFactor: number;
  lastEvaluatedAt: string;
}

export interface DbLocation {
  studyLocationId: string;
  locationGroupId: string;
  currentNoiseLevel: number | null;
  currentOccupancyLevel: number | null;
  updatedAt: string | null;
}

export interface DbLocationGroup {
  locationGroupId: string;
  currentNoiseLevel: number | null;
  currentOccupancyLevel: number | null;
  updatedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** POST /api/test/reset — wipe all test collections */
export async function resetTestData(api: APIRequestContext): Promise<void> {
  const res = await api.post(`${BASE}/api/test/reset`);
  if (!res.ok()) throw new Error(`reset failed: ${res.status()} ${await res.text()}`);
}

/** POST /api/test/seed-user — create a verified user and return a JWT */
export async function seedTestUser(
  api: APIRequestContext,
  payload: SeedUserPayload,
): Promise<SeedUserResponse> {
  const res = await api.post(`${BASE}/api/test/seed-user`, { data: payload });
  if (!res.ok()) throw new Error(`seed-user failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<SeedUserResponse>;
}

/** POST /api/reports — submit a report as an authenticated user */
export async function submitReport(
  api: APIRequestContext,
  token: string,
  payload: ReportPayload,
): Promise<SubmitReportResponse> {
  const res = await api.post(`${BASE}/api/reports`, {
    data: payload,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`submit report failed: ${res.status()} ${await res.text()}`);
  // Response shape: { report, metadata, studyLocation, locationGroup, cycle }
  const body = await res.json() as { report: SubmitReportResponse };
  return body.report;
}

/** POST /api/test/trigger-poll — run A1 polling cycle synchronously */
export async function triggerPollCycle(api: APIRequestContext): Promise<void> {
  const res = await api.post(`${BASE}/api/test/trigger-poll`);
  if (!res.ok()) throw new Error(`trigger-poll failed: ${res.status()} ${await res.text()}`);
}

/** GET /api/test/report/:id — raw Report + ReportTagMetadata from DB */
export async function getReportFromDb(
  api: APIRequestContext,
  reportId: string,
): Promise<{ report: DbReport | null; metadata: DbReportTagMetadata | null }> {
  const res = await api.get(`${BASE}/api/test/report/${reportId}`);
  if (!res.ok()) throw new Error(`get report failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** GET /api/test/location/:id — raw StudyLocation + LocationGroup from DB */
export async function getLocationFromDb(
  api: APIRequestContext,
  locationId: string,
): Promise<{ location: DbLocation | null; group: DbLocationGroup | null }> {
  const res = await api.get(`${BASE}/api/test/location/${locationId}`);
  if (!res.ok()) throw new Error(`get location failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** GET /api/test/reports/:locationId — all Reports + metadata for a location */
export async function getLocationReportsFromDb(
  api: APIRequestContext,
  locationId: string,
): Promise<{ reports: DbReport[]; metadata: DbReportTagMetadata[] }> {
  const res = await api.get(`${BASE}/api/test/reports/${locationId}`);
  if (!res.ok()) throw new Error(`get location reports failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** GET /api/reports/history/:id — archived summaries for a location (requires auth) */
export async function getLocationHistory(
  api: APIRequestContext,
  token: string,
  locationId: string,
  at?: string,
): Promise<unknown> {
  const url = at
    ? `${BASE}/api/reports/history/${locationId}?at=${encodeURIComponent(at)}`
    : `${BASE}/api/reports/history/${locationId}`;
  const res = await api.get(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) throw new Error(`get history failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** GET /api/reports/recent — most recent live reports (requires auth) */
export async function getRecentReports(
  api: APIRequestContext,
  token: string,
): Promise<Array<{ studyLocationId: string; reportId: string }>> {
  const res = await api.get(`${BASE}/api/reports/recent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`get recent failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

// ── Admin API helpers ─────────────────────────────────────────────────────────

/** GET /api/admin/users — list all users (requires admin token) */
export async function adminListUsers(
  api: APIRequestContext,
  token: string,
  query?: string,
): Promise<AdminUserRecord[]> {
  const url = query
    ? `${BASE}/api/admin/users?q=${encodeURIComponent(query)}`
    : `${BASE}/api/admin/users`;
  const res = await api.get(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) throw new Error(`admin list users failed: ${res.status()} ${await res.text()}`);
  const body = await res.json() as { users: AdminUserRecord[] };
  return body.users;
}

/** PATCH /api/admin/users/:userId — edit a user (requires admin token) */
export async function adminEditUser(
  api: APIRequestContext,
  token: string,
  userId: string,
  updates: { email?: string; role?: string; accountStatus?: string; userOccupancyWF?: number },
): Promise<AdminUserRecord> {
  const res = await api.patch(`${BASE}/api/admin/users/${userId}`, {
    data: updates,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`admin edit user failed: ${res.status()} ${await res.text()}`);
  const body = await res.json() as { user: AdminUserRecord };
  return body.user;
}

/** DELETE /api/admin/users/:userId — delete a user (requires admin token) */
export async function adminDeleteUser(
  api: APIRequestContext,
  token: string,
  userId: string,
): Promise<void> {
  const res = await api.delete(`${BASE}/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`admin delete user failed: ${res.status()} ${await res.text()}`);
}

// ── Location-group helpers (configurable baseUrl for live tests) ───────────────

export interface LocationGroupVertex {
  latitude: number;
  longitude: number;
}

export interface LocationGroupRecord {
  locationGroupId: string;
  name: string;
  shapeType?: string;
  polygon?: LocationGroupVertex[];
  centerLatitude?: number;
  centerLongitude?: number;
}

export interface SplitGroupResult {
  message: string;
  groupA: LocationGroupRecord;
  groupB: LocationGroupRecord;
  deletedGroupId: string;
}

export interface MergeGroupResult {
  message: string;
  destinationGroup: LocationGroupRecord;
  newGroupId: string;
  requiresRedraw: boolean;
  deletedGroupIds: string[];
}

/**
 * POST /api/auth/login — authenticate with real credentials.
 * Returns the accessToken and serialized user object (includes role, displayName, login).
 */
export async function loginWithPassword(
  api: APIRequestContext,
  baseUrl: string,
  login: string,
  password: string,
): Promise<{ accessToken: string; user: { role: string; displayName: string; login: string } }> {
  const res = await api.post(`${baseUrl}/api/auth/login`, { data: { login, password } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** GET /api/locations/groups — list all location groups */
export async function getLocationGroups(
  api: APIRequestContext,
  baseUrl: string,
  token: string,
): Promise<LocationGroupRecord[]> {
  const res = await api.get(`${baseUrl}/api/locations/groups`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`get groups failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** PUT /api/admin/location-groups/:groupId/shape — save a redrawn polygon */
export async function adminPutGroupShape(
  api: APIRequestContext,
  baseUrl: string,
  token: string,
  groupId: string,
  polygon: LocationGroupVertex[],
): Promise<{ message: string; group: LocationGroupRecord }> {
  const res = await api.put(`${baseUrl}/api/admin/location-groups/${groupId}/shape`, {
    data: { shapeType: 'polygon', polygon },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`put shape failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** POST /api/admin/location-groups/:groupId/split — split a group into two */
export async function adminSplitGroup(
  api: APIRequestContext,
  baseUrl: string,
  token: string,
  groupId: string,
  body: {
    parentPolygon: LocationGroupVertex[];
    splitLine: LocationGroupVertex[];
    destinationGroups: [{ name: string }, { name: string }];
  },
): Promise<SplitGroupResult> {
  const res = await api.post(`${baseUrl}/api/admin/location-groups/${groupId}/split`, {
    data: body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`split failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** POST /api/admin/location-groups/merge — merge two groups into one */
export async function adminMergeGroups(
  api: APIRequestContext,
  baseUrl: string,
  token: string,
  sourceGroupIds: [string, string],
  destinationName: string,
): Promise<MergeGroupResult> {
  const res = await api.post(`${baseUrl}/api/admin/location-groups/merge`, {
    data: { sourceGroupIds, destinationName },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`merge failed: ${res.status()} ${await res.text()}`);
  return res.json();
}
