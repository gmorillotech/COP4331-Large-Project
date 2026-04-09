/**
 * auth.spec.ts — Login page UI tests.
 *
 * Strategy:
 *   - Navigate to the login page (/) using a real Chromium browser.
 *   - Use the test-only /api/test/seed-user endpoint to create a fully-verified
 *     user so we can test successful login without triggering the email flow.
 *   - All other scenarios (bad password, unverified account) are tested via
 *     the real backend running against the test database.
 *
 * What is NOT tested here:
 *   - Google Maps integration (requires a live API key; tested separately if needed)
 *   - Password-reset email delivery (nodemailer is not configured in test mode)
 */

import { test, expect, request } from '@playwright/test';
import { seedTestUser, resetTestData } from '../helpers/apiClient.js';
import { TEST_USER } from '../helpers/seedData.js';

const LOGIN_URL = '/';

// ── Hooks ─────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  const api = await request.newContext();
  await resetTestData(api);
  await api.dispose();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fillLoginForm(
  page: import('@playwright/test').Page,
  login: string,
  password: string,
): Promise<void> {
  await page.fill('#loginName', login);
  await page.fill('#loginPassword', password);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Login page — UI', () => {
  test('page loads and shows login form', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await expect(page.locator('#loginName')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeVisible();
  });

  test('tab switching shows register form', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.click('button:has-text("Register")');
    await expect(page.locator('#regEmail')).toBeVisible();
    await expect(page.locator('#regUsername')).toBeVisible();
    await expect(page.locator('#registerButton')).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await fillLoginForm(page, 'nobody', 'wrongpassword');
    await page.click('#loginButton');
    await expect(page.locator('#loginResult')).toBeVisible();
    await expect(page.locator('#loginResult')).toHaveClass(/error/);
  });

  test('shows error when fields are empty', async ({ page }) => {
    await page.goto(LOGIN_URL);
    // Click login without filling anything
    await page.click('#loginButton');
    // Server returns 400/401 — the component shows an error message
    await expect(page.locator('#loginResult')).toBeVisible();
    await expect(page.locator('#loginResult')).toHaveClass(/error/);
  });

  test('forgot password link shows forgot-password view', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.click('text=Forgot Password?');
    await expect(page.locator('#forgotEmail')).toBeVisible();
    await expect(page.locator('#forgotButton')).toBeVisible();
  });

  test('back to login link returns to login form', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.click('text=Forgot Password?');
    await page.click('text=← Back to Login');
    await expect(page.locator('#loginName')).toBeVisible();
  });
});

test.describe('Login page — successful login flow', () => {
  test('logs in with seeded verified user and redirects to /home', async ({ page }) => {
    // Seed a verified user first
    const api = await request.newContext();
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await page.goto(LOGIN_URL);
    await fillLoginForm(page, TEST_USER.login, TEST_USER.password);
    await page.click('#loginButton');

    // Should redirect to /home after successful login
    await page.waitForURL('**/home', { timeout: 10_000 });
    expect(page.url()).toContain('/home');
  });

  test('stores token and user_data in localStorage after login', async ({ page }) => {
    const api = await request.newContext();
    await seedTestUser(api, TEST_USER);
    await api.dispose();

    await page.goto(LOGIN_URL);
    await fillLoginForm(page, TEST_USER.login, TEST_USER.password);
    await page.click('#loginButton');
    await page.waitForURL('**/home', { timeout: 10_000 });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const userData = await page.evaluate(() => localStorage.getItem('user_data'));

    expect(token).toBeTruthy();
    expect(userData).toBeTruthy();

    const user = JSON.parse(userData!);
    expect(user.login).toBe(TEST_USER.login);
  });
});

test.describe('Register tab', () => {
  test('shows error when required fields are missing', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.click('button:has-text("Register")');
    // Click Create Account without filling anything
    await page.click('#registerButton');
    // The component itself shows a client-side error before the API is called
    await expect(page.locator('#loginResult')).toBeVisible();
    await expect(page.locator('#loginResult')).toHaveClass(/error/);
  });

  test('shows verification box after successful registration', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.click('button:has-text("Register")');

    await page.fill('#regFirstName', 'E2E');
    await page.fill('#regLastName', 'Tester');
    await page.fill('#regDisplayName', 'E2E Tester');
    await page.fill('#regEmail', 'brand-new-e2e@test.invalid');
    await page.fill('#regUsername', 'e2e-brand-new');
    await page.fill('#regPassword', 'ValidPass123!');
    await page.click('#registerButton');

    // After success the component renders an info-box prompting email verification
    await expect(page.locator('.info-box')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=verification email')).toBeVisible();
  });
});
