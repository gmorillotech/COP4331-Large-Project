import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Assumes two servers are running when `npm run e2e` is invoked:
 *   - Backend  : http://localhost:5050  (started via `npm run e2e:server` in server/)
 *   - Frontend : http://localhost:5173  (started via `vite`)
 *
 * Run sequentially (workers: 1) so that shared MongoDB state is predictable.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  globalSetup: './e2e/setup/globalSetup.ts',
  globalTeardown: './e2e/setup/globalTeardown.ts',
});
