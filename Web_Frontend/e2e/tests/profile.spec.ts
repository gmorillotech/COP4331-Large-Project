/**
 * profile.spec.ts — Playwright E2E tests for the ProfilePanel slide-out.
 *
 * The ProfilePanel opens from the dashboard "Open profile" button on /home.
 * It has two interactive views:
 *   • Main profile view (display name, email, username, member since, password)
 *   • Edit display name view (input + Save Changes button)
 *   • Forgot-password flow (Reset → code entry → new password)
 *
 * Covers:
 *   P. Panel open / close
 *   Q. Display name editing
 *   R. Password reset flow (UI transitions)
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
    ({ token, role, login, displayName }) => {
      localStorage.setItem('token', token);
      localStorage.setItem(
        'user_data',
        JSON.stringify({ role, displayName, login }),
      );
    },
    {
      token: user.accessToken,
      role: user.role,
      login: user.login,
      displayName: TEST_USER.login, // use login as display name seed
    },
  );
}

/** Navigate to /home, wait for map to load, then open the profile panel. */
async function openProfilePanel(page: Page): Promise<void> {
  await page.goto('/home');
  await expect(page.locator('.map-status')).toContainText('locations shown', { timeout: 10_000 });
  await page.locator('[aria-label="Open profile"]').click();
  await expect(page.locator('.profile-panel.open')).toBeVisible({ timeout: 5_000 });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

let user: SeedUserResponse;

test.beforeEach(async () => {
  const api = await request.newContext();
  await resetTestData(api);
  user = await seedTestUser(api, TEST_USER);
  await api.dispose();
});

// ── P. Panel open / close ─────────────────────────────────────────────────────

test.describe('Profile panel — open and close', () => {
  test('P1 — clicking "Open profile" opens the profile slide-out panel', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    await expect(page.locator('.profile-panel.open')).toBeVisible();
  });

  test('P2 — panel shows Display Name, Email, Username, Member Since, and Password sections', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const labels = page.locator('.profile-label');
    await expect(labels.filter({ hasText: 'Display Name' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Email' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Username' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Member Since' })).toBeVisible();
    await expect(labels.filter({ hasText: 'Password' })).toBeVisible();
  });

  test('P3 — clicking the ✕ button closes the panel', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    await page.locator('.profile-close-btn').click();
    await expect(page.locator('.profile-panel.open')).not.toBeVisible();
  });

  test('P4 — clicking the overlay closes the panel', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    // Click outside the panel on the overlay backdrop
    await page.locator('.profile-overlay').click({ force: true });
    await expect(page.locator('.profile-panel.open')).not.toBeVisible();
  });
});

// ── Q. Display name editing ───────────────────────────────────────────────────

test.describe('Profile panel — edit display name', () => {
  test('Q1 — clicking "Edit" next to Display Name shows the edit view', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    // Click the Edit button in the Display Name section
    const displaySection = page.locator('.profile-section').filter({ hasText: 'Display Name' });
    await displaySection.locator('.profile-edit-btn').click();

    await expect(page.locator('.profile-edit-title')).toHaveText('Edit Display Name');
    await expect(page.locator('.profile-input')).toBeVisible();
    await expect(page.locator('.profile-save-btn')).toBeVisible();
  });

  test('Q2 — "← Back" in edit view returns to the main profile view', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const displaySection = page.locator('.profile-section').filter({ hasText: 'Display Name' });
    await displaySection.locator('.profile-edit-btn').click();

    await page.locator('.profile-back-btn').click();

    // Back to the main profile view — labels visible again
    await expect(page.locator('.profile-label').filter({ hasText: 'Display Name' })).toBeVisible();
    await expect(page.locator('.profile-edit-title')).not.toBeVisible();
  });

  test('Q3 — typing a new display name and saving shows a success message', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const displaySection = page.locator('.profile-section').filter({ hasText: 'Display Name' });
    await displaySection.locator('.profile-edit-btn').click();

    await page.locator('.profile-input').fill('Updated E2E Name');
    await page.locator('.profile-save-btn').click();

    await expect(page.locator('.profile-message.success')).toContainText(
      'Display name updated successfully',
      { timeout: 8_000 },
    );
  });

  test('Q4 — saving an empty display name shows a validation error', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const displaySection = page.locator('.profile-section').filter({ hasText: 'Display Name' });
    await displaySection.locator('.profile-edit-btn').click();

    // Clear the input and try to save
    await page.locator('.profile-input').fill('');
    await page.locator('.profile-save-btn').click();

    await expect(page.locator('.profile-message.error')).toContainText(
      'Display name cannot be empty',
      { timeout: 5_000 },
    );
  });
});

// ── R. Password reset flow ────────────────────────────────────────────────────

test.describe('Profile panel — password reset flow', () => {
  test('R1 — clicking "Reset" next to Password triggers the forgot-password flow', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const passwordSection = page.locator('.profile-section').filter({ hasText: 'Password' });
    await passwordSection.locator('.profile-edit-btn').click();

    // Backend returns 200 (forgotPassword always succeeds even when email delivery fails)
    // Panel transitions to 'forgotSent' view with code-entry step
    await expect(page.locator('.profile-edit-title')).toHaveText('Enter Reset Code', { timeout: 8_000 });
    await expect(page.locator('.profile-input')).toHaveAttribute('placeholder', '6-digit code');
    await expect(page.locator('.profile-save-btn')).toHaveText('Verify Code');
  });

  test('R2 — entering a code and clicking "Verify Code" advances to the new-password step', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const passwordSection = page.locator('.profile-section').filter({ hasText: 'Password' });
    await passwordSection.locator('.profile-edit-btn').click();

    // Wait for code-entry view
    await expect(page.locator('.profile-edit-title')).toHaveText('Enter Reset Code', { timeout: 8_000 });

    await page.locator('.profile-input').fill('123456');
    await page.locator('.profile-save-btn').click(); // "Verify Code"

    // Advances locally to newpass step (no server call for code verification at this step)
    await expect(page.locator('.profile-edit-title')).toHaveText('Set New Password', { timeout: 5_000 });
  });

  test('R3 — "← Back" from the reset flow returns to the main profile view', async ({ page }) => {
    await loginAs(page, user);
    await openProfilePanel(page);

    const passwordSection = page.locator('.profile-section').filter({ hasText: 'Password' });
    await passwordSection.locator('.profile-edit-btn').click();

    await expect(page.locator('.profile-edit-title')).toHaveText('Enter Reset Code', { timeout: 8_000 });

    await page.locator('.profile-back-btn').click();

    // Returns to main profile view
    await expect(page.locator('.profile-label').filter({ hasText: 'Display Name' })).toBeVisible();
  });
});
