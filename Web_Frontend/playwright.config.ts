import { defineConfig, devices } from '@playwright/test';

/**
 * Unified Playwright configuration.
 *
 * LOCAL tests (auth + report-pipeline):
 *   npm run e2e
 *   Requires both servers running:
 *     server/  → npm run e2e:server   (NODE_ENV=test node server.js on :5050)
 *     frontend → npm run dev          (Vite on :5173)
 *
 * LIVE tests (location-edit lifecycle):
 *   SKIP_LOCAL=true \
 *   LIVE_BASE_URL=https://studyspot.live \
 *   LIVE_ADMIN_LOGIN=<login> \
 *   LIVE_ADMIN_PASSWORD=<password> \
 *   npm run e2e:live
 *
 * ALL tests (local + live in one run):
 *   LIVE_BASE_URL=https://studyspot.live \
 *   LIVE_ADMIN_LOGIN=<login> \
 *   LIVE_ADMIN_PASSWORD=<password> \
 *   npm run e2e:all
 *
 * Environment variables:
 *   LIVE_BASE_URL       — enables the live project (e.g. https://studyspot.live)
 *   LIVE_ADMIN_LOGIN    — admin account login for live tests
 *   LIVE_ADMIN_PASSWORD — admin account password for live tests
 *   SKIP_LOCAL          — set to "true" to skip local project (live-only run)
 */

const LIVE_BASE_URL = process.env.LIVE_BASE_URL;
const skipLocal = process.env.SKIP_LOCAL === 'true';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  // globalSetup/Teardown reset the local test DB — skip when running live-only
  globalSetup: skipLocal ? undefined : './e2e/setup/globalSetup.ts',
  globalTeardown: skipLocal ? undefined : './e2e/setup/globalTeardown.ts',

  projects: [
    // ── Local project ────────────────────────────────────────────────────────
    // Runs auth.spec.ts + report-pipeline.spec.ts against localhost.
    // Skipped when SKIP_LOCAL=true (live-only runs).
    ...(!skipLocal
      ? [
          {
            name: 'local',
            testIgnore: ['**/location-edit.spec.ts'],
            timeout: 30_000,
            expect: { timeout: 10_000 },
            use: {
              baseURL: 'http://localhost:5173',
              ...devices['Desktop Chrome'],
              trace: 'on-first-retry' as const,
              screenshot: 'only-on-failure' as const,
            },
          },
        ]
      : []),

    // ── Live project ─────────────────────────────────────────────────────────
    // Runs location-edit.spec.ts against the deployed app.
    // Only added when LIVE_BASE_URL is set.
    ...(LIVE_BASE_URL
      ? [
          {
            name: 'live',
            testMatch: ['**/location-edit.spec.ts'],
            timeout: 60_000,
            expect: { timeout: 15_000 },
            use: {
              baseURL: LIVE_BASE_URL,
              ...devices['Desktop Chrome'],
              trace: 'retain-on-failure' as const,
              screenshot: 'only-on-failure' as const,
              video: 'retain-on-failure' as const,
            },
          },
        ]
      : []),
  ],
});
