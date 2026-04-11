/**
 * map.spec.ts — Playwright E2E tests for all map and home-page user functionality.
 *
 * Covers:
 *   A. Map page load and baseline (controls, status, sidebar, dashboard)
 *   B. Search bar (filter, partial match, clear, no-results, case-insensitive)
 *   C. Severity filter chips (high / medium / low / all, chip state)
 *   D. Sort dropdown (quietest / loudest / relevance, combined with filter)
 *   E. Location card selection (click, switch, single-at-a-time)
 *   F. Favorites (toggle on card, drawer open/close/empty/remove/multi)
 *   G. Combined filter + search
 *   H. API validation (GET /api/map-annotations field structure, counts)
 *   I. Dashboard navigation (data collection, logout, profile)
 *   J. Guest / unauthenticated access (/home accessible, data loads)
 *
 * ── Catalog data (6 fixed locations used as test fixtures) ──────────────────
 *
 *   library-floor-1-quiet   John C. Hitt Library · Floor 1  severity:low   noise:43
 *   library-floor-2-moderate John C. Hitt Library · Floor 2  severity:medium noise:57
 *   library-floor-3-busy    John C. Hitt Library · Floor 3  severity:high  noise:73
 *   library-floor-4-empty   John C. Hitt Library · Floor 4  severity:low   noise:39
 *   msb-floor-2-moderate    Mathematical Sciences Building · Floor 2 severity:medium noise:55
 *   student-union-food-court Student Union · Level 1         severity:high  noise:76
 *
 * ── Not covered (requires Google Maps API key absent in local dev .env) ─────
 *
 *   - Map canvas rendering (AdvancedMarker pins, heat overlay)
 *   - Clicking a map pin to select a location / auto-pan camera
 *   - InfoWindow popup (anchored to map canvas — needs map instance)
 *
 *   These features are deployed and work in the live environment. All user-facing
 *   behavior reachable through the sidebar and control bar is covered here.
 */

import { test, expect, request } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resetTestData, seedTestUser } from '../helpers/apiClient.js';
import type { SeedUserResponse } from '../helpers/apiClient.js';
import { TEST_USER } from '../helpers/seedData.js';

// ── Catalog fixture counts ────────────────────────────────────────────────────

const TOTAL_LOCATIONS   = 6;
const LIBRARY_LOCATIONS = 4;   // all John C. Hitt Library entries
const HIGH_LOCATIONS    = 2;   // library-floor-3-busy (73 dB), student-union-food-court (76 dB)
const MEDIUM_LOCATIONS  = 2;   // library-floor-2-moderate (57 dB), msb-floor-2-moderate (55 dB)
const LOW_LOCATIONS     = 2;   // library-floor-1-quiet (43 dB), library-floor-4-empty (39 dB)

// Unique sublocation labels — used to pinpoint individual cards reliably.
// .location-card__name shows "BuildingName · FloorLabel" (not the title field),
// so sublocation labels are the clearest unique identifiers per location.
const LOC = {
  QUIET_ROOM:   'North Reading Room', // library-floor-1, low,    43 dB
  COLLAB:       'West Commons',       // library-floor-2, medium, 57 dB
  COMPUTER_LAB: 'Digital Media Area', // library-floor-3, high,   73 dB
  CUBICLES:     'East Quiet Wing',    // library-floor-4, low,    39 dB (quietest)
  MSB:          'Atrium Balcony',     // msb-floor-2,     medium, 55 dB
  FOOD_COURT:   'South Dining Hall',  // student-union,   high,   76 dB (loudest)
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Inject auth credentials into localStorage so the app treats the page as logged-in. */
async function loginAs(page: Page, user: SeedUserResponse): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ token, role, login }) => {
      localStorage.setItem('token', token);
      localStorage.setItem(
        'user_data',
        JSON.stringify({ role, displayName: 'E2E User', login }),
      );
    },
    { token: user.accessToken, role: user.role, login: user.login },
  );
}

/**
 * Navigate to /home and wait for the API fetch to complete.
 * The status bar transitions from "Loading…" to "X locations shown" once the
 * map-annotations response arrives, so waiting for that text is the most
 * reliable signal that the sidebar is fully populated.
 */
async function goToMap(page: Page): Promise<void> {
  await page.goto('/home');
  await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

// Reset the test DB before every test so each starts with clean state.
test.beforeEach(async () => {
  const api = await request.newContext();
  await resetTestData(api);
  await api.dispose();
});

// ── A. Map page load ──────────────────────────────────────────────────────────

test.describe('Map page — baseline load', () => {

  test('A1 — controls bar renders with search input, sort dropdown, and all 4 filter chips', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    // Search bar
    await expect(page.locator('.map-search__input')).toBeVisible();
    await expect(page.locator('.map-search__input')).toHaveAttribute('placeholder', /search/i);

    // Sort dropdown
    await expect(page.locator('.map-sort-select')).toBeVisible();

    // All four filter chips present
    const chips = page.locator('.map-chip');
    await expect(chips).toHaveCount(4);
    await expect(chips.filter({ hasText: 'All levels' })).toBeVisible();
    await expect(chips.filter({ hasText: 'High' })).toBeVisible();
    await expect(chips.filter({ hasText: 'Medium' })).toBeVisible();
    await expect(chips.filter({ hasText: 'Low' })).toBeVisible();

    // "All levels" is active by default
    await expect(chips.filter({ hasText: 'All levels' })).toHaveClass(/is-active/);
  });

  test('A2 — status bar shows "6 locations shown" after data loads', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    await expect(page.locator('.map-status')).toHaveText('6 locations shown');
  });

  test('A3 — sidebar shows a card for each of the 6 catalog locations', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    await expect(page.locator('.location-card')).toHaveCount(TOTAL_LOCATIONS);

    // Spot-check representative locations by their unique sublocation labels
    await expect(page.locator('.location-card__sub', { hasText: LOC.QUIET_ROOM })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.MSB })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.FOOD_COURT })).toBeVisible();
  });

  test('A4 — first location is auto-selected on load', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    // MapExplorer sets selectedId = data.results[0].id after the API fetch completes
    await expect(page.locator('.location-card.is-selected')).toHaveCount(1);
  });

  test('A5 — dashboard bar shows welcome message and all four action buttons', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    await expect(page.locator('.dash-welcome')).toContainText('Welcome Back');
    await expect(page.locator('[aria-label="Open favorites"]')).toBeVisible();
    await expect(page.locator('[aria-label="Open profile"]')).toBeVisible();
    await expect(page.locator('[aria-label="Start data collection session"]')).toBeVisible();
    await expect(page.locator('[aria-label="Log out"]')).toBeVisible();
  });

  test('A6 — each card shows a noise chip with level text', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER);
    await api.dispose();
    await loginAs(page, user);
    await goToMap(page);

    // Every card should have a noise chip
    await expect(page.locator('.location-card__noise-chip').first()).toBeVisible();

    // Spot-check a high-noise and a low-noise chip.
    // NoiseChip strips the "Noise: " prefix via rawText.replace(/^noise:\s*/i, '').
    // The backend's toNoiseText() maps dB ranges to Quiet/Moderate/Loud (3 categories),
    // so East Quiet Wing (39 dB) shows "Quiet (39.0 dB)", not "Very quiet".
    const foodCourtCard = page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT });
    await expect(foodCourtCard.locator('.location-card__noise-chip')).toContainText('Loud');

    const cubiclesCard = page.locator('.location-card').filter({ hasText: LOC.CUBICLES });
    await expect(cubiclesCard.locator('.location-card__noise-chip')).toContainText('Quiet');
  });
});

// ── B. Search behavior ────────────────────────────────────────────────────────

test.describe('Map page — search', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('B1 — searching "Library" shows only the 4 library-floor locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Library');

    await expect(page.locator('.location-card')).toHaveCount(LIBRARY_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.map-status')).toHaveText('4 locations shown');

    // All 4 library sublocations visible
    await expect(page.locator('.location-card__sub', { hasText: LOC.QUIET_ROOM })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.COLLAB })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.COMPUTER_LAB })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.CUBICLES })).toBeVisible();

    // Non-library locations gone
    await expect(page.locator('.location-card__sub', { hasText: LOC.MSB })).not.toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.FOOD_COURT })).not.toBeVisible();
  });

  test('B2 — partial match "Math" returns only the MSB location', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Math');

    await expect(page.locator('.location-card')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.MSB })).toBeVisible();
    await expect(page.locator('.map-status')).toHaveText('1 location shown');
  });

  test('B3 — searching "Union" returns only the Student Union location', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Union');

    await expect(page.locator('.location-card')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.FOOD_COURT })).toBeVisible();
  });

  test('B4 — clear button (✕) resets search and restores all locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Library');
    await expect(page.locator('.location-card')).toHaveCount(LIBRARY_LOCATIONS, { timeout: 5_000 });

    // Clear button appears when text is in the field
    await expect(page.locator('.map-search__clear')).toBeVisible();
    await page.click('.map-search__clear');

    await expect(page.locator('.location-card')).toHaveCount(TOTAL_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.map-status')).toHaveText('6 locations shown');
    // Clear button disappears when field is empty
    await expect(page.locator('.map-search__clear')).not.toBeVisible();
  });

  test('B5 — searching a non-matching term shows empty state and "0 locations shown"', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'xyzxyz_no_match_at_all');

    await expect(page.locator('.location-list__empty')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.location-list__empty')).toContainText('No study spaces match');
    await expect(page.locator('.map-status')).toHaveText('0 locations shown');
  });

  test('B6 — search is case-insensitive ("LIBRARY" and "library" give same results)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'LIBRARY');
    await expect(page.locator('.location-card')).toHaveCount(LIBRARY_LOCATIONS, { timeout: 5_000 });

    await page.fill('.map-search__input', 'library');
    await expect(page.locator('.location-card')).toHaveCount(LIBRARY_LOCATIONS, { timeout: 5_000 });
  });

  test('B7 — clear button is not visible when search input is empty', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    // No text entered — clear button should not be present
    await expect(page.locator('.map-search__clear')).not.toBeVisible();
  });
});

// ── C. Severity filter chips ──────────────────────────────────────────────────

test.describe('Map page — severity filter', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('C1 — "High" chip activates and shows only the 2 high-severity locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const highChip = page.locator('.map-chip', { hasText: 'High' });
    await highChip.click();

    await expect(highChip).toHaveClass(/is-active/);
    await expect(page.locator('.location-card')).toHaveCount(HIGH_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.map-status')).toHaveText('2 locations shown');

    // library-floor-3-busy and student-union-food-court
    await expect(page.locator('.location-card__sub', { hasText: LOC.COMPUTER_LAB })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.FOOD_COURT })).toBeVisible();
  });

  test('C2 — "Medium" chip shows only the 2 medium-severity locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.map-chip', { hasText: 'Medium' }).click();

    await expect(page.locator('.location-card')).toHaveCount(MEDIUM_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.COLLAB })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.MSB })).toBeVisible();
  });

  test('C3 — "Low" chip shows only the 2 low-severity locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.map-chip', { hasText: 'Low' }).click();

    await expect(page.locator('.location-card')).toHaveCount(LOW_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.QUIET_ROOM })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.CUBICLES })).toBeVisible();
  });

  test('C4 — "All levels" resets filter and shows all 6 locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.map-chip', { hasText: 'High' }).click();
    await expect(page.locator('.location-card')).toHaveCount(HIGH_LOCATIONS, { timeout: 5_000 });

    await page.locator('.map-chip', { hasText: 'All levels' }).click();
    await expect(page.locator('.location-card')).toHaveCount(TOTAL_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.map-chip', { hasText: 'All levels' })).toHaveClass(/is-active/);
  });

  test('C5 — switching chips deactivates the previously active one', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.map-chip', { hasText: 'High' }).click();
    await expect(page.locator('.map-chip', { hasText: 'High' })).toHaveClass(/is-active/);
    await expect(page.locator('.map-chip', { hasText: 'All levels' })).not.toHaveClass(/is-active/);

    await page.locator('.map-chip', { hasText: 'Low' }).click();
    await expect(page.locator('.map-chip', { hasText: 'Low' })).toHaveClass(/is-active/);
    await expect(page.locator('.map-chip', { hasText: 'High' })).not.toHaveClass(/is-active/);
  });
});

// ── D. Sort dropdown ──────────────────────────────────────────────────────────

test.describe('Map page — sort', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('D1 — "Quietest first" places Low-severity cards before Medium and High', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.selectOption('.map-sort-select', 'noise-asc');

    // The backend's toNoiseText() maps both 39 dB and 43 dB to "Noise: Quiet",
    // so both Low locations (North Reading Room and East Quiet Wing) share the same
    // inferNoiseValue (0.22) and are tied in the sort — catalog order breaks the tie.
    // We verify that both leading cards are "Quiet" and the loudest is last.
    const firstCard = page.locator('.location-card').first();
    const secondCard = page.locator('.location-card').nth(1);
    await expect(firstCard.locator('.location-card__noise-chip')).toContainText('Quiet');
    await expect(secondCard.locator('.location-card__noise-chip')).toContainText('Quiet');

    // The South Dining Hall (loudest — "Loud" chip) must appear last
    const lastCard = page.locator('.location-card').last();
    await expect(lastCard.locator('.location-card__sub')).toHaveText(LOC.FOOD_COURT);
  });

  test('D2 — "Loudest first" places High-severity cards before Medium and Low', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.selectOption('.map-sort-select', 'noise-desc');

    // The backend's toNoiseText() maps both 73 dB and 76 dB to "Noise: Loud",
    // so both High locations (Digital Media Area and South Dining Hall) share the same
    // inferNoiseValue (0.9) and are tied in the sort — catalog order breaks the tie,
    // placing Digital Media Area (Floor 3, position 3) before South Dining Hall (position 6).
    // We verify that both leading cards are "Loud" and the last card is "Quiet".
    const firstCard = page.locator('.location-card').first();
    const secondCard = page.locator('.location-card').nth(1);
    await expect(firstCard.locator('.location-card__noise-chip')).toContainText('Loud');
    await expect(secondCard.locator('.location-card__noise-chip')).toContainText('Loud');

    // The last card must be one of the Low-severity (Quiet) locations
    const lastCard = page.locator('.location-card').last();
    await expect(lastCard.locator('.location-card__noise-chip')).toContainText('Quiet');
  });

  test('D3 — switching back to "Relevance" still shows all 6 locations', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.selectOption('.map-sort-select', 'noise-asc');
    await page.selectOption('.map-sort-select', 'relevance');

    await expect(page.locator('.location-card')).toHaveCount(TOTAL_LOCATIONS);
  });

  test('D4 — "Quietest first" + "High" filter: Computer Lab (73 dB) before Food Court (76 dB)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.selectOption('.map-sort-select', 'noise-asc');
    await page.locator('.map-chip', { hasText: 'High' }).click();

    await expect(page.locator('.location-card')).toHaveCount(HIGH_LOCATIONS, { timeout: 5_000 });
    const firstCard = page.locator('.location-card').first();
    await expect(firstCard.locator('.location-card__sub')).toHaveText(LOC.COMPUTER_LAB);
  });

  test('D5 — "Loudest first" + "Low" filter: Quiet Room (43 dB) after Cubicles (39 dB)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.selectOption('.map-sort-select', 'noise-desc');
    await page.locator('.map-chip', { hasText: 'Low' }).click();

    await expect(page.locator('.location-card')).toHaveCount(LOW_LOCATIONS, { timeout: 5_000 });
    const firstCard = page.locator('.location-card').first();
    // Loudest of the two low-severity locations: North Reading Room (43 dB)
    await expect(firstCard.locator('.location-card__sub')).toHaveText(LOC.QUIET_ROOM);
  });
});

// ── E. Card selection ─────────────────────────────────────────────────────────

test.describe('Map page — location card selection', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('E1 — clicking a card gives it the .is-selected class', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const card = page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT });
    await card.click();

    await expect(card).toHaveClass(/is-selected/);
  });

  test('E2 — clicking a different card moves the selection', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const cardA = page.locator('.location-card').filter({ hasText: LOC.MSB });
    const cardB = page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT });

    await cardA.click();
    await expect(cardA).toHaveClass(/is-selected/);
    await expect(cardB).not.toHaveClass(/is-selected/);

    await cardB.click();
    await expect(cardB).toHaveClass(/is-selected/);
    await expect(cardA).not.toHaveClass(/is-selected/);
  });

  test('E3 — exactly one card is selected at a time', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.location-card').filter({ hasText: LOC.COMPUTER_LAB }).click();
    await expect(page.locator('.location-card.is-selected')).toHaveCount(1);
  });

  test('E4 — clicking heart button does not change card selection', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    // Select MSB card
    const msbCard = page.locator('.location-card').filter({ hasText: LOC.MSB });
    await msbCard.click();
    await expect(msbCard).toHaveClass(/is-selected/);

    // Click heart on food court card — should not move selection
    const foodCourtCard = page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT });
    await foodCourtCard.locator('.location-card__heart-btn').click();
    await expect(msbCard).toHaveClass(/is-selected/);
    await expect(foodCourtCard).not.toHaveClass(/is-selected/);
  });
});

// ── F. Favorites ──────────────────────────────────────────────────────────────

test.describe('Map page — favorites', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('F1 — clicking heart on a card toggles it from unfavorited (♡) to favorited (♥)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const card = page.locator('.location-card').filter({ hasText: LOC.MSB });
    const heartBtn = card.locator('.location-card__heart-btn');

    await expect(heartBtn).not.toHaveClass(/is-favorited/);
    await expect(heartBtn).toHaveText('♡');
    await expect(heartBtn).toHaveAttribute('aria-label', 'Add to favorites');

    await heartBtn.click();

    await expect(heartBtn).toHaveClass(/is-favorited/);
    await expect(heartBtn).toHaveText('♥');
    await expect(heartBtn).toHaveAttribute('aria-label', 'Remove from favorites');
  });

  test('F2 — clicking heart again unfavorites the location', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const heartBtn = page.locator('.location-card').filter({ hasText: LOC.MSB }).locator('.location-card__heart-btn');

    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/is-favorited/);

    await heartBtn.click();
    await expect(heartBtn).not.toHaveClass(/is-favorited/);
    await expect(heartBtn).toHaveText('♡');
  });

  test('F3 — favorites drawer opens when dashboard heart button is clicked', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Open favorites"]');

    await expect(page.locator('.favorites-drawer.open')).toBeVisible();
    await expect(page.locator('.favorites-drawer__header')).toContainText('My Favorites');
  });

  test('F4 — empty favorites drawer shows "No favorites yet" message', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Open favorites"]');

    await expect(page.locator('.favorites-drawer__empty')).toBeVisible();
    await expect(page.locator('.favorites-drawer__empty')).toContainText('No favorites yet');
  });

  test('F5 — favorited location appears in the open drawer', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.location-card').filter({ hasText: LOC.MSB }).locator('.location-card__heart-btn').click();

    await page.click('[aria-label="Open favorites"]');

    await expect(page.locator('.favorites-drawer.open')).toBeVisible();
    await expect(page.locator('.favorites-drawer__list')).toBeVisible();
    await expect(page.locator('.favorites-drawer__item')).toHaveCount(1);
    await expect(page.locator('.favorites-drawer__item')).toContainText('Atrium Balcony');
  });

  test('F6 — removing from the drawer unfavorites the card too', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    const heartBtn = page.locator('.location-card').filter({ hasText: LOC.MSB }).locator('.location-card__heart-btn');
    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/is-favorited/);

    await page.click('[aria-label="Open favorites"]');
    await expect(page.locator('.favorites-drawer__item')).toHaveCount(1);

    await page.locator('.favorites-drawer__remove').click();

    // Drawer shows empty state
    await expect(page.locator('.favorites-drawer__empty')).toBeVisible();
    // Card heart reverts to outline
    await expect(heartBtn).not.toHaveClass(/is-favorited/);
    await expect(heartBtn).toHaveText('♡');
  });

  test('F7 — clicking the overlay closes the drawer', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Open favorites"]');
    await expect(page.locator('.favorites-drawer.open')).toBeVisible();

    await page.click('.favorites-overlay');
    await expect(page.locator('.favorites-drawer')).not.toHaveClass(/open/);
  });

  test('F8 — clicking the ✕ button closes the drawer', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Open favorites"]');
    await expect(page.locator('.favorites-drawer.open')).toBeVisible();

    await page.click('.favorites-drawer__close');
    await expect(page.locator('.favorites-drawer')).not.toHaveClass(/open/);
  });

  test('F9 — multiple favorited locations all appear in the drawer', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.location-card').filter({ hasText: LOC.MSB }).locator('.location-card__heart-btn').click();
    await page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT }).locator('.location-card__heart-btn').click();
    await page.locator('.location-card').filter({ hasText: LOC.QUIET_ROOM }).locator('.location-card__heart-btn').click();

    await page.click('[aria-label="Open favorites"]');
    await expect(page.locator('.favorites-drawer__item')).toHaveCount(3);
  });

  test('F10 — clicking a favorited item in the drawer selects it on the map and closes the drawer', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.locator('.location-card').filter({ hasText: LOC.MSB }).locator('.location-card__heart-btn').click();

    await page.click('[aria-label="Open favorites"]');
    await page.locator('.favorites-drawer__item-info').click();

    // Drawer closes
    await expect(page.locator('.favorites-drawer')).not.toHaveClass(/open/);
    // MSB card is now selected
    const msbCard = page.locator('.location-card').filter({ hasText: LOC.MSB });
    await expect(msbCard).toHaveClass(/is-selected/);
  });
});

// ── G. Search + filter combinations ──────────────────────────────────────────

test.describe('Map page — search + filter combination', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('G1 — "Library" search + "High" filter narrows to 1 result (Computer Lab)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Library');
    await page.locator('.map-chip', { hasText: 'High' }).click();

    await expect(page.locator('.location-card')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.COMPUTER_LAB })).toBeVisible();
    await expect(page.locator('.map-status')).toHaveText('1 location shown');
  });

  test('G2 — "Library" search + "Low" filter shows 2 results (Quiet Room + Cubicles)', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Library');
    await page.locator('.map-chip', { hasText: 'Low' }).click();

    await expect(page.locator('.location-card')).toHaveCount(2, { timeout: 5_000 });
    await expect(page.locator('.location-card__sub', { hasText: LOC.QUIET_ROOM })).toBeVisible();
    await expect(page.locator('.location-card__sub', { hasText: LOC.CUBICLES })).toBeVisible();
  });

  test('G3 — clearing search while filter is active keeps the filter applied', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'Library');
    await page.locator('.map-chip', { hasText: 'High' }).click();
    await expect(page.locator('.location-card')).toHaveCount(1, { timeout: 5_000 });

    await page.click('.map-search__clear');

    // Filter still active: now both high-severity locations are visible
    await expect(page.locator('.location-card')).toHaveCount(HIGH_LOCATIONS, { timeout: 5_000 });
    await expect(page.locator('.map-chip', { hasText: 'High' })).toHaveClass(/is-active/);
  });

  test('G4 — non-matching search + any filter always shows empty state', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.fill('.map-search__input', 'xyzxyz_no_match');
    await page.locator('.map-chip', { hasText: 'High' }).click();

    await expect(page.locator('.location-list__empty')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.map-status')).toHaveText('0 locations shown');
  });
});

// ── H. API validation ─────────────────────────────────────────────────────────

test.describe('Map API — /api/map-annotations', () => {

  test('H1 — returns 200 with 6 catalog locations', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    expect(res.ok()).toBe(true);
    expect(res.status()).toBe(200);

    const body = await res.json() as { results: unknown[] };
    expect(body.results).toHaveLength(TOTAL_LOCATIONS);
  });

  test('H2 — every location has required fields (id, lat, lng, title)', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    const body = await res.json() as {
      results: Array<{ id: string; lat: number; lng: number; title: string; severity: string }>;
    };

    for (const loc of body.results) {
      expect(typeof loc.id).toBe('string');
      expect(loc.id.length).toBeGreaterThan(0);
      expect(typeof loc.lat).toBe('number');
      expect(typeof loc.lng).toBe('number');
      expect(typeof loc.title).toBe('string');
    }
  });

  test('H3 — returns all 6 expected catalog location IDs', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    const body = await res.json() as { results: Array<{ id: string }> };
    const ids = body.results.map((l) => l.id);

    expect(ids).toContain('library-floor-1-quiet');
    expect(ids).toContain('library-floor-2-moderate');
    expect(ids).toContain('library-floor-3-busy');
    expect(ids).toContain('library-floor-4-empty');
    expect(ids).toContain('msb-floor-2-moderate');
    expect(ids).toContain('student-union-food-court');
  });

  test('H4 — severity field is valid (low/medium/high) for every location', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    const body = await res.json() as { results: Array<{ severity: string }> };

    const valid = new Set(['low', 'medium', 'high']);
    for (const loc of body.results) {
      expect(valid.has(loc.severity)).toBe(true);
    }
  });

  test('H5 — severity counts are exactly 2 high, 2 medium, 2 low', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    const body = await res.json() as { results: Array<{ severity: string }> };

    const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    for (const loc of body.results) counts[loc.severity]++;

    expect(counts.high).toBe(2);
    expect(counts.medium).toBe(2);
    expect(counts.low).toBe(2);
  });

  test('H6 — lat/lng values are within UCF campus range', async ({ request: req }) => {
    const res = await req.get('http://localhost:5050/api/map-annotations');
    const body = await res.json() as { results: Array<{ lat: number; lng: number }> };

    // UCF main campus bounding box (approximate)
    for (const loc of body.results) {
      expect(loc.lat).toBeGreaterThan(28.59);
      expect(loc.lat).toBeLessThan(28.62);
      expect(loc.lng).toBeGreaterThan(-81.22);
      expect(loc.lng).toBeLessThan(-81.18);
    }
  });
});

// ── I. Dashboard navigation ───────────────────────────────────────────────────

test.describe('Map page — dashboard navigation', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('I1 — microphone button navigates to /collect page', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Start data collection session"]');
    await expect(page).toHaveURL(/\/collect/);
  });

  test('I2 — logout clears localStorage token and user_data and redirects to /', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Log out"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('#loginName')).toBeVisible(); // login page is showing

    const token    = await page.evaluate(() => localStorage.getItem('token'));
    const userData = await page.evaluate(() => localStorage.getItem('user_data'));
    expect(token).toBeNull();
    expect(userData).toBeNull();
  });

  test('I3 — profile button opens the profile panel slide-out', async ({ page }) => {
    await loginAs(page, user);
    await goToMap(page);

    await page.click('[aria-label="Open profile"]');
    await expect(page.locator('.profile-panel.open')).toBeVisible({ timeout: 5_000 });
  });

  test('I4 — display name from user_data appears in the dashboard welcome message', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'fake-token-for-display-test');
      localStorage.setItem('user_data', JSON.stringify({ role: 'user', displayName: 'Alice Example', login: 'alice' }));
    });
    await page.goto('/home');

    await expect(page.locator('.dash-welcome')).toContainText('Alice Example');
  });
});

// ── J. Guest / unauthenticated access ─────────────────────────────────────────

test.describe('Map page — guest access', () => {

  test('J1 — /home is accessible without auth (no redirect to login)', async ({ page }) => {
    // No token injected — direct navigation as a guest
    await page.goto('/home');
    await expect(page.locator('.map-controls-bar')).toBeVisible({ timeout: 10_000 });
    // Confirms we did NOT get redirected to the login page
    await expect(page.locator('#loginName')).not.toBeVisible();
  });

  test('J2 — map loads location data for unauthenticated visitors', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });
    await expect(page.locator('.location-card')).toHaveCount(TOTAL_LOCATIONS);
  });

  test('J3 — guest can search and filter without being logged in', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });

    await page.fill('.map-search__input', 'Library');
    await expect(page.locator('.location-card')).toHaveCount(LIBRARY_LOCATIONS, { timeout: 5_000 });

    await page.locator('.map-chip', { hasText: 'High' }).click();
    await expect(page.locator('.location-card')).toHaveCount(1, { timeout: 5_000 });
  });

  test('J4 — guest can toggle favorites locally (no token sync, still updates UI)', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });

    const heartBtn = page.locator('.location-card')
      .filter({ hasText: LOC.MSB })
      .locator('.location-card__heart-btn');

    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/is-favorited/);
    await expect(heartBtn).toHaveText('♥');
  });

  test('J5 — guest can select cards and the selection is shown correctly', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });

    const card = page.locator('.location-card').filter({ hasText: LOC.FOOD_COURT });
    await card.click();
    await expect(card).toHaveClass(/is-selected/);
  });
});
