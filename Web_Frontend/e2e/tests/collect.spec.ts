/**
 * collect.spec.ts — Playwright E2E tests for the /collect (DataCollectionPage) route.
 *
 * The page hosts the SessionManager component, which requires microphone and
 * geolocation permissions to record noise data. Because those hardware-level
 * permissions are not available in headless Chromium, these tests cover:
 *
 *   K. Page shell & navigation
 *   L. Permission modal behaviour
 *   M. Main collection UI (noise meter, mic button, occupancy selector)
 *   N. Error handling for missing permissions / state
 *   O. Guest / unauthenticated access
 *
 * The full recording + submission flow is exercised by the existing
 * report-pipeline.spec.ts suite which hits the API directly.
 */

import { test, expect, request } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resetTestData, seedTestUser } from '../helpers/apiClient.js';
import type { SeedUserResponse } from '../helpers/apiClient.js';
import { TEST_USER } from '../helpers/seedData.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Navigate to /collect and wait for the page shell to appear. */
async function goToCollect(page: Page): Promise<void> {
  await page.goto('/collect');
  await expect(page.locator('.datacollection-title')).toBeVisible({ timeout: 8_000 });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  const api = await request.newContext();
  await resetTestData(api);
  await api.dispose();
});

// ── K. Page shell & navigation ────────────────────────────────────────────────

test.describe('Data collection — page shell', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('K1 — page renders "Contribute Data" title and back button', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    await expect(page.locator('.datacollection-title')).toHaveText('Contribute Data');
    await expect(page.locator('.datacollection-back-btn')).toBeVisible();
    await expect(page.locator('.datacollection-subtitle')).toContainText('noise and occupancy');
  });

  test('K2 — "← Back to Map" button navigates to /home', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    // Dismiss the permission modal first so we can interact with the page
    await page.locator('.session-btn--secondary').first().click();

    await page.locator('.datacollection-back-btn').click();
    await expect(page).toHaveURL(/\/home/);
  });
});

// ── L. Permission modal ───────────────────────────────────────────────────────

test.describe('Data collection — permission modal', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('L1 — permission modal appears immediately on page load', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    const modal = page.locator('.session-modal').first();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Enable Location');
    await expect(modal).toContainText('Microphone');
  });

  test('L2 — modal shows "Allow Access" and "Not Now" buttons', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    const modal = page.locator('.session-modal').first();
    await expect(modal.locator('.session-btn--primary')).toHaveText('Allow Access');
    await expect(modal.locator('.session-btn--secondary')).toHaveText('Not Now');
  });

  test('L3 — clicking "Not Now" dismisses the modal', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    // Modal is visible
    await expect(page.locator('.session-overlay')).toBeVisible();

    await page.locator('.session-btn--secondary').first().click();

    // Modal dismissed — overlay gone
    await expect(page.locator('.session-overlay')).not.toBeVisible();
  });
});

// ── M. Main collection UI ─────────────────────────────────────────────────────

test.describe('Data collection — main UI after dismissing modal', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  /** Dismiss the permission modal so the main UI is interactable. */
  async function dismissModal(page: Page): Promise<void> {
    await page.locator('.session-btn--secondary').first().click();
    await expect(page.locator('.session-overlay')).not.toBeVisible();
  }

  test('M1 — noise meter panel is visible with "NOISE LEVEL" label', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);
    await dismissModal(page);

    await expect(page.locator('.dc-container')).toBeVisible();
    await expect(page.locator('.dc-panel').first()).toContainText('NOISE LEVEL');
  });

  test('M2 — mic button is visible with aria-label "Start Session"', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);
    await dismissModal(page);

    const micBtn = page.locator('.session-mic-btn');
    await expect(micBtn).toBeVisible();
    await expect(micBtn).toHaveAttribute('aria-label', 'Start Session');
  });

  test('M3 — all five occupancy level buttons are visible', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);
    await dismissModal(page);

    const labels = page.locator('.dc-occupancy-label-btn');
    await expect(labels).toHaveCount(5);
    await expect(labels.filter({ hasText: 'Full' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Busy' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Moderate' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Sparse' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Empty' })).toBeVisible();
  });

  test('M4 — clicking an occupancy label activates it', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);
    await dismissModal(page);

    const moderateBtn = page.locator('.dc-occupancy-label-btn', { hasText: 'Moderate' });
    await moderateBtn.click();
    await expect(moderateBtn).toHaveClass(/active/);
  });

  test('M5 — selecting a different occupancy level deactivates the previous one', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);
    await dismissModal(page);

    const fullBtn   = page.locator('.dc-occupancy-label-btn', { hasText: 'Full' });
    const emptyBtn  = page.locator('.dc-occupancy-label-btn', { hasText: 'Empty' });

    await fullBtn.click();
    await expect(fullBtn).toHaveClass(/active/);

    await emptyBtn.click();
    await expect(emptyBtn).toHaveClass(/active/);
    await expect(fullBtn).not.toHaveClass(/active/);
  });
});

// ── N. Error handling ─────────────────────────────────────────────────────────

test.describe('Data collection — error states', () => {
  let user: SeedUserResponse;

  test.beforeEach(async () => {
    const api = await request.newContext();
    user = await seedTestUser(api, TEST_USER);
    await api.dispose();
  });

  test('N1 — clicking mic without granting permissions shows an error message', async ({ page }) => {
    await loginAs(page, user);
    await goToCollect(page);

    // Dismiss modal without granting permissions → micPermission stays 'pending'
    await page.locator('.session-btn--secondary').first().click();

    await page.locator('.session-mic-btn').click();

    // Should show the "grant permissions" error
    await expect(page.locator('.session-bar__message.error')).toContainText(
      'Please grant microphone and location permissions first',
      { timeout: 5_000 },
    );
  });
});

// ── O. Guest access ───────────────────────────────────────────────────────────

test.describe('Data collection — guest access', () => {
  test('O1 — /collect is accessible without authentication (no redirect to login)', async ({ page }) => {
    // Navigate without setting any localStorage token
    await page.goto('/collect');

    // Page should load (not redirect to /)
    await expect(page).toHaveURL(/\/collect/);
    await expect(page.locator('.datacollection-title')).toBeVisible({ timeout: 8_000 });
  });
});
