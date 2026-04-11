/**
 * admin.spec.ts — Playwright E2E tests for all admin-mode functionality.
 *
 * Covers:
 *   - AdminGuard access control (unauthenticated, regular user, admin)
 *   - Admin navigation (links, logout)
 *   - Admin Search page (search bar, results, detail panel)
 *   - Manage Users page (list, search, edit, force-reset, delete)
 *   - Admin API access control (401/403/200 at the HTTP level)
 *
 * Not covered (require Google Maps API key / interactive map drawing):
 *   - LocationEditPage merge flow (requires map pin selection)
 *   - RedrawGroupPage (requires polygon drawing on map)
 *   - SplitGroupPage (requires split-line drawing on map)
 */

import { test, expect, request } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  resetTestData,
  seedTestUser,
  adminListUsers,
  adminEditUser,
  adminDeleteUser,
} from '../helpers/apiClient.js';
import type { SeedUserResponse } from '../helpers/apiClient.js';
import { TEST_ADMIN, TEST_USER, TEST_USER_2 } from '../helpers/seedData.js';

const BASE_API = 'http://localhost:5050';

// ── Hooks ─────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  const api = await request.newContext();
  await resetTestData(api);
  await api.dispose();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Inject a user's credentials directly into localStorage so the AdminGuard
 * accepts the session without going through the login form.
 * Call before navigating to any /admin route.
 */
async function loginAs(page: Page, user: SeedUserResponse): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ token, role, login }) => {
      localStorage.setItem('token', token);
      localStorage.setItem(
        'user_data',
        JSON.stringify({
          role,
          displayName: 'E2E Admin',
          firstName: 'E2E',
          lastName: 'Admin',
          login,
        }),
      );
    },
    { token: user.accessToken, role: user.role, login: user.login },
  );
}

// ── Access Control ────────────────────────────────────────────────────────────

test.describe('Admin access control', () => {
  test('unauthenticated visitor is redirected from /admin to /', async ({ page }) => {
    // No localStorage set — visit /admin directly
    await page.goto('/admin');
    // AdminGuard returns <Navigate to="/" replace /> when no user_data in storage
    // Verify we landed on the login page, not inside the admin layout
    await expect(page.locator('#loginName')).toBeVisible();
    await expect(page.locator('.admin-badge')).not.toBeVisible();
  });

  test('regular user sees Access Denied page at /admin', async ({ page }) => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER); // role: 'user'
    await api.dispose();

    await loginAs(page, user);
    await page.goto('/admin');

    await expect(page.locator('text=Access Denied')).toBeVisible();
    await expect(page.locator('text=You do not have admin privileges')).toBeVisible();
  });

  test('admin user can access the admin dashboard', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin');

    await expect(page.locator('.admin-badge')).toBeVisible();
    await expect(page.locator('.admin-search-bar__input')).toBeVisible();
  });
});

// ── Admin Navigation ──────────────────────────────────────────────────────────

test.describe('Admin navigation', () => {
  test.beforeEach(async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();
    await loginAs(page, admin);
    await page.goto('/admin');
    await expect(page.locator('.admin-badge')).toBeVisible();
  });

  test('shows ADMIN badge and display name', async ({ page }) => {
    await expect(page.locator('.admin-badge')).toHaveText('ADMIN');
    await expect(page.locator('.admin-user-name')).toBeVisible();
  });

  test('Manage Users nav link navigates to /admin/users', async ({ page }) => {
    await page.click('text=Manage Users');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator('h1', { hasText: 'Manage Users' })).toBeVisible();
  });

  test('Location Edit nav link navigates to /admin/locations', async ({ page }) => {
    await page.click('text=Location Edit');
    await expect(page).toHaveURL(/\/admin\/locations/);
  });

  test('Back to App link navigates to /home', async ({ page }) => {
    await page.click('text=Back to App');
    await expect(page).toHaveURL(/\/home/);
  });

  test('Logout clears localStorage and redirects to /', async ({ page }) => {
    await page.click('.admin-logout-btn');

    await expect(page).toHaveURL('/');

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const userData = await page.evaluate(() => localStorage.getItem('user_data'));
    expect(token).toBeNull();
    expect(userData).toBeNull();
  });
});

// ── Admin Search Page ─────────────────────────────────────────────────────────

test.describe('Admin search page', () => {
  test.beforeEach(async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();
    await loginAs(page, admin);
    await page.goto('/admin');
  });

  test('search input and results panel are visible', async ({ page }) => {
    await expect(page.locator('.admin-search-bar__input')).toBeVisible();
    await expect(page.locator('.admin-results-panel')).toBeVisible();
  });

  test('default page load shows catalog locations in results', async ({ page }) => {
    // The admin search endpoint falls back to the catalog — locations appear
    // without any search term
    await expect(page.locator('.admin-result-item').first()).toBeVisible({ timeout: 8_000 });
  });

  test('searching "library" returns Library results', async ({ page }) => {
    // Wait for initial catalog results before typing (ensures fetch mechanism is live)
    await expect(page.locator('.admin-result-item').first()).toBeVisible({ timeout: 8_000 });
    await page.fill('.admin-search-bar__input', 'library');
    // The group result "John C. Hitt Library" should appear among filtered results
    await expect(
      page.locator('.admin-result-item__name', { hasText: /Hitt Library/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('clear button empties the search input', async ({ page }) => {
    await page.fill('.admin-search-bar__input', 'library');
    await expect(page.locator('.admin-search-bar__clear')).toBeVisible();
    await page.click('.admin-search-bar__clear');
    await expect(page.locator('.admin-search-bar__input')).toHaveValue('');
  });

  test('clicking a result shows its detail panel', async ({ page }) => {
    // Wait for results to load
    await expect(page.locator('.admin-result-item').first()).toBeVisible({ timeout: 8_000 });
    // The first item is auto-selected on load — the "no-selection" placeholder should be gone
    await expect(page.locator('.admin-detail__no-selection')).not.toBeVisible();
    // Explicitly click first result to confirm detail stays populated
    await page.locator('.admin-result-item').first().click();
    await expect(page.locator('.admin-detail__no-selection')).not.toBeVisible();
  });
});

// ── Manage Users — Loading ────────────────────────────────────────────────────

test.describe('Manage Users — user list', () => {
  test('shows seeded users in the table', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');

    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });
    // Both admin and TEST_USER should appear (2 rows)
    const rows = page.locator('.user-table tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('search input filters the user list', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // Type a search query that uniquely matches TEST_USER (not the admin)
    await page.fill('.manage-users-search', 'testuser');
    // Wait for debounce + reload
    await expect(page.locator('.user-table tbody tr')).toHaveCount(1, { timeout: 8_000 });
    await expect(page.locator('.user-table tbody tr').first()).toContainText(TEST_USER.email);
  });

  test('shows empty state when no users match search', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    await page.fill('.manage-users-search', 'nobody-will-ever-match-this-xyz');
    await expect(page.locator('.manage-users-empty')).toBeVisible({ timeout: 8_000 });
  });
});

// ── Manage Users — Edit dialog ────────────────────────────────────────────────

test.describe('Manage Users — Edit user dialog', () => {
  test('Edit button opens dialog with user data', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // Click Edit in the TEST_USER row
    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.edit').click();

    await expect(page.locator('.modal-dialog')).toBeVisible();
    await expect(page.locator('.modal-dialog h2')).toContainText('Edit User');
  });

  test('changing role to admin via edit dialog updates the table', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // Open edit dialog for TEST_USER
    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.edit').click();
    await expect(page.locator('.modal-dialog')).toBeVisible();

    // Change role to "admin"
    const roleGroup = page.locator('.form-group').filter({ hasText: 'Role' });
    await roleGroup.locator('.form-select').selectOption('admin');

    await page.locator('.modal-btn.primary').click();

    // Dialog should close
    await expect(page.locator('.modal-dialog')).not.toBeVisible({ timeout: 8_000 });

    // Role badge for TEST_USER row should now show "admin"
    await expect(page.locator('tr').filter({ hasText: TEST_USER.email }).locator('.role-badge'))
      .toHaveText('admin', { timeout: 8_000 });
  });

  test('changing accountStatus to suspended via edit dialog updates the table', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.edit').click();
    await expect(page.locator('.modal-dialog')).toBeVisible();

    const statusGroup = page.locator('.form-group').filter({ hasText: 'Account Status' });
    await statusGroup.locator('.form-select').selectOption('suspended');

    await page.locator('.modal-btn.primary').click();
    await expect(page.locator('.modal-dialog')).not.toBeVisible({ timeout: 8_000 });

    await expect(
      page.locator('tr').filter({ hasText: TEST_USER.email }).locator('.status-badge'),
    ).toHaveText('suspended', { timeout: 8_000 });
  });

  test('cancel button closes dialog without saving', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.edit').click();
    await expect(page.locator('.modal-dialog')).toBeVisible();

    await page.locator('.modal-btn.cancel').click();
    await expect(page.locator('.modal-dialog')).not.toBeVisible();

    // Role unchanged — still "user"
    await expect(
      page.locator('tr').filter({ hasText: TEST_USER.email }).locator('.role-badge'),
    ).toHaveText('user');
  });
});

// ── Manage Users — Force Password Reset ───────────────────────────────────────

test.describe('Manage Users — Force password reset', () => {
  test('Reset Password button opens confirmation dialog', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.reset-pw').click();

    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await expect(page.locator('.confirm-dialog h2')).toHaveText('Force Password Reset');
  });

  test('cancelling confirm dialog closes without action', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.reset-pw').click();
    await expect(page.locator('.confirm-dialog')).toBeVisible();

    await page.locator('.confirm-dialog .modal-btn.cancel').click();
    await expect(page.locator('.confirm-dialog')).not.toBeVisible();

    // Status should still be "active"
    await expect(
      page.locator('tr').filter({ hasText: TEST_USER.email }).locator('.status-badge'),
    ).toHaveText('active');
  });

  test('confirming force reset changes user status to "forced reset"', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.reset-pw').click();
    await expect(page.locator('.confirm-dialog')).toBeVisible();

    await page.locator('.confirm-dialog .modal-btn.danger').click();

    // Dialog closes after API call completes
    await expect(page.locator('.confirm-dialog')).not.toBeVisible({ timeout: 8_000 });

    // After table refresh, TEST_USER status should be "forced reset"
    await expect(
      page.locator('tr').filter({ hasText: TEST_USER.email }).locator('.status-badge'),
    ).toHaveText('forced reset', { timeout: 8_000 });
  });
});

// ── Manage Users — Delete ─────────────────────────────────────────────────────

test.describe('Manage Users — Delete user', () => {
  test('Delete button opens confirmation dialog', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.delete').click();

    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await expect(page.locator('.confirm-dialog h2')).toHaveText('Delete User');
  });

  test('Delete button is disabled until the correct email is typed', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.delete').click();
    await expect(page.locator('.confirm-dialog')).toBeVisible();

    const deleteBtn = page.locator('.confirm-dialog .modal-btn.danger');

    // Initially disabled (empty input)
    await expect(deleteBtn).toBeDisabled();

    // Wrong email → still disabled
    await page.locator('.confirm-email-input').fill('wrong@email.com');
    await expect(deleteBtn).toBeDisabled();

    // Correct email → enabled
    await page.locator('.confirm-email-input').fill(TEST_USER.email);
    await expect(deleteBtn).toBeEnabled();
  });

  test('confirming delete removes the user from the table', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.delete').click();
    await page.locator('.confirm-email-input').fill(TEST_USER.email);
    await page.locator('.confirm-dialog .modal-btn.danger').click();

    // Dialog closes
    await expect(page.locator('.confirm-dialog')).not.toBeVisible({ timeout: 8_000 });

    // TEST_USER row is gone; only admin row remains
    await expect(page.locator('.user-table tbody tr')).toHaveCount(1, { timeout: 8_000 });
    await expect(page.locator('tr').filter({ hasText: TEST_USER.email })).not.toBeVisible();
  });

  test('admin cannot delete their own account', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // There is only one row — the admin themselves
    const adminRow = page.locator('.user-table tbody tr').first();
    await adminRow.locator('.action-btn.delete').click();
    await page.locator('.confirm-email-input').fill(TEST_ADMIN.email);
    await page.locator('.confirm-dialog .modal-btn.danger').click();

    // API returns 400 "Cannot delete your own account" → error message in dialog
    await expect(
      page.locator('.confirm-dialog .modal-message.error'),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Admin API — HTTP-level access control ─────────────────────────────────────

test.describe('Admin API — access control', () => {
  test('GET /api/admin/users without token returns 401', async () => {
    const api = await request.newContext();
    const res = await api.get(`${BASE_API}/api/admin/users`);
    await api.dispose();
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/users with regular-user token returns 403', async () => {
    const api = await request.newContext();
    const user = await seedTestUser(api, TEST_USER); // role: 'user'
    const res = await api.get(`${BASE_API}/api/admin/users`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    await api.dispose();
    expect(res.status()).toBe(403);
  });

  test('GET /api/admin/users with admin token returns 200 and user list', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    const users = await adminListUsers(api, admin.accessToken);
    await api.dispose();
    expect(users.length).toBe(2);
    const emails = users.map((u) => u.email);
    expect(emails).toContain(TEST_USER.email);
    expect(emails).toContain(TEST_ADMIN.email);
  });

  test('PATCH /api/admin/users/:id with admin token updates user', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    const user = await seedTestUser(api, TEST_USER);
    const updated = await adminEditUser(api, admin.accessToken, user.userId, {
      accountStatus: 'suspended',
    });
    await api.dispose();
    expect(updated.accountStatus).toBe('suspended');
  });

  test('PATCH /api/admin/users/:id with duplicate email returns 409', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    const user = await seedTestUser(api, TEST_USER);
    // Try to give TEST_USER the admin's email
    const res = await api.patch(`${BASE_API}/api/admin/users/${user.userId}`, {
      data: { email: TEST_ADMIN.email },
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    await api.dispose();
    expect(res.status()).toBe(409);
  });

  test('DELETE /api/admin/users/:id with admin token removes the user', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    const user = await seedTestUser(api, TEST_USER_2);
    await adminDeleteUser(api, admin.accessToken, user.userId);
    // Verify user is gone from the list
    const remaining = await adminListUsers(api, admin.accessToken);
    await api.dispose();
    expect(remaining.find((u) => u.userId === user.userId)).toBeUndefined();
  });

  test('DELETE /api/admin/users — admin cannot delete own account (400)', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    const res = await api.delete(`${BASE_API}/api/admin/users/${admin.userId}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    // Read response body before disposing the context
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    await api.dispose();
    expect(body.error).toMatch(/own account/i);
  });

  test('GET /api/admin/search with admin token returns location results', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    const res = await api.get(
      `${BASE_API}/api/admin/search?q=library&includeGroups=true&includeLocations=true&sortBy=relevance`,
      { headers: { Authorization: `Bearer ${admin.accessToken}` } },
    );
    // Read response body before disposing the context
    expect(res.status()).toBe(200);
    const body = await res.json() as { results: unknown[] };
    await api.dispose();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });
});

// ── Invalid / expired token ───────────────────────────────────────────────────

test.describe('Admin — invalid token behavior', () => {
  /**
   * AdminGuard is a client-side check (reads role from localStorage only).
   * It does NOT validate the JWT signature, so the admin layout renders even
   * with a bogus token.  The backend rejects the first API call with 401 and
   * the page surfaces an error instead of crashing or silently failing.
   */
  test('invalid JWT shows API error on /admin/users, page does not crash', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // Syntactically plausible but cryptographically invalid token
      localStorage.setItem('token', 'invalid.jwt.token');
      localStorage.setItem('user_data', JSON.stringify({ role: 'admin', displayName: 'Fake Admin' }));
    });

    await page.goto('/admin/users');

    // AdminGuard passes (role check is localStorage-only), but the users
    // fetch returns 401 → ManageUsersPage renders the error state
    await expect(page.locator('.manage-users-error')).toBeVisible({ timeout: 8_000 });
    // The page heading is still present — no JS crash
    await expect(page.locator('h1', { hasText: 'Manage Users' })).toBeVisible();
  });

  test('missing token with admin user_data shows API error on /admin/users', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.setItem('user_data', JSON.stringify({ role: 'admin', displayName: 'Admin' }));
    });

    await page.goto('/admin/users');

    // No Bearer token → backend returns 401 → error state shown
    await expect(page.locator('.manage-users-error')).toBeVisible({ timeout: 8_000 });
  });
});

// ── Admin self-modification rules ─────────────────────────────────────────────

test.describe('Admin — self-modification rules', () => {
  /**
   * Self-demotion: the backend has NO guard against an admin PATCHing their
   * own role to "user".  The change takes effect immediately — any subsequent
   * admin API call with the same token returns 403 because requireAdmin now
   * sees role="user" in the database.
   */
  test('admin can demote themselves to user via PATCH (no backend guard)', async () => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);

    const patchRes = await api.patch(`${BASE_API}/api/admin/users/${admin.userId}`, {
      data: { role: 'user' },
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json() as { user: { role: string } };
    expect(patchBody.user.role).toBe('user');

    // The same token is now rejected for any subsequent admin API call
    const followUpRes = await api.get(`${BASE_API}/api/admin/users`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    await api.dispose();
    expect(followUpRes.status()).toBe(403);
  });

  test('admin self-demotion via UI closes dialog then triggers self-lockout on refresh', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // Admin is the only user — open their own row's edit dialog (no UI guard)
    const adminRow = page.locator('.user-table tbody tr').first();
    await adminRow.locator('.action-btn.edit').click();
    await expect(page.locator('.modal-dialog')).toBeVisible();
    await expect(page.locator('.modal-dialog h2')).toContainText('Edit User');

    // Change role to "user" — no UI warning prevents this
    const roleGroup = page.locator('.form-group').filter({ hasText: 'Role' });
    await roleGroup.locator('.form-select').selectOption('user');
    await page.locator('.modal-btn.primary').click();

    // PATCH succeeds (200) → dialog closes.
    // The table then re-fetches with the same token, but the DB now has role="user",
    // so requireAdmin rejects it (403) → page shows the error state (self-lockout).
    await expect(page.locator('.modal-dialog')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.manage-users-error')).toBeVisible({ timeout: 8_000 });
  });
});

// ── API failure handling ──────────────────────────────────────────────────────

test.describe('Admin — API failure handling', () => {
  test('GET /api/admin/users returning 500 shows error, page does not crash', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await api.dispose();

    await loginAs(page, admin);

    // Intercept before navigation so the very first fetch is affected
    await page.route('**/api/admin/users*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      }),
    );

    await page.goto('/admin/users');

    // Error state rendered, page heading still present
    await expect(page.locator('.manage-users-error')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('h1', { hasText: 'Manage Users' })).toBeVisible();
  });

  test('PATCH /api/admin/users/:id returning 500 shows error in edit dialog', async ({ page }) => {
    const api = await request.newContext();
    const admin = await seedTestUser(api, TEST_ADMIN);
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await loginAs(page, admin);
    await page.goto('/admin/users');
    await expect(page.locator('.user-table')).toBeVisible({ timeout: 8_000 });

    // Open edit dialog for TEST_USER
    const userRow = page.locator('tr').filter({ hasText: TEST_USER.email });
    await userRow.locator('.action-btn.edit').click();
    await expect(page.locator('.modal-dialog')).toBeVisible();

    // Make a change so Save actually sends the PATCH
    const roleGroup = page.locator('.form-group').filter({ hasText: 'Role' });
    await roleGroup.locator('.form-select').selectOption('admin');

    // Intercept only PATCH requests; let GET (table refresh) through
    await page.route('**/api/admin/users/**', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.locator('.modal-btn.primary').click();

    // Dialog stays open with an error message — does not crash or disappear
    await expect(page.locator('.modal-dialog')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.modal-message.error')).toBeVisible({ timeout: 8_000 });
  });
});
