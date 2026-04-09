/**
 * seedData.ts — Shared fixtures for E2E tests.
 *
 * Location IDs come from server/services/locationCatalog.js — the six known
 * UCF study spaces that are always available via the catalog fallback.
 */

import { ReportPayload, SeedUserPayload } from './apiClient.js';

// ── Test users ────────────────────────────────────────────────────────────────

export const TEST_USER: SeedUserPayload = {
  login: 'e2e-testuser',
  email: 'e2e-testuser@test.invalid',
  password: 'E2ePassword123!',
};

export const TEST_USER_2: SeedUserPayload = {
  login: 'e2e-testuser2',
  email: 'e2e-testuser2@test.invalid',
  password: 'E2ePassword456!',
};

// ── Catalog location IDs (from locationCatalog.js) ───────────────────────────

export const STUDY_LOCATIONS = {
  LIBRARY_FLOOR_1_QUIET:  'library-floor-1-quiet',
  LIBRARY_FLOOR_2_MODERATE: 'library-floor-2-moderate',
  LIBRARY_FLOOR_3_BUSY:   'library-floor-3-busy',
  LIBRARY_FLOOR_4_EMPTY:  'library-floor-4-empty',
  MSB_FLOOR_2_MODERATE:   'msb-floor-2-moderate',
  STUDENT_UNION_FOOD_COURT: 'student-union-food-court',
} as const;

export type StudyLocationId = (typeof STUDY_LOCATIONS)[keyof typeof STUDY_LOCATIONS];

// ── Report payload factories ──────────────────────────────────────────────────
//
// The report API requires:  studyLocationId, avgNoise, maxNoise, variance, occupancy
// occupancy must be 1–5.

export function makeReportPayload(
  locationId: StudyLocationId,
  overrides: Partial<ReportPayload> = {},
): ReportPayload {
  return {
    studyLocationId: locationId,
    avgNoise: 40,
    maxNoise: 55,
    variance: 5,
    occupancy: 2,
    ...overrides,
  };
}
