import { request } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5050';
const FRONTEND_URL = 'http://localhost:5173';
const MAX_WAIT_MS = 20_000;
const POLL_MS = 500;

async function waitForServer(url: string, label: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const ctx = await request.newContext();
      const res = await ctx.get(url);
      await ctx.dispose();
      if (res.ok()) {
        console.log(`[globalSetup] ${label} ready at ${url}`);
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`[globalSetup] Timed out waiting for ${label} at ${url}`);
}

export default async function globalSetup(): Promise<void> {
  // 1. Wait for both servers
  await waitForServer(`${BACKEND_URL}/api/health`, 'Backend');
  await waitForServer(FRONTEND_URL, 'Frontend');

  // 2. Wipe the test database so every run starts clean
  const ctx = await request.newContext({ baseURL: BACKEND_URL });
  const res = await ctx.post('/api/test/reset');

  const responseText = await res.text();

  if (!res.ok()) {
    await ctx.dispose();
    throw new Error(`[globalSetup] DB reset failed: ${res.status()} ${responseText}`);
  }

  await ctx.dispose();
  console.log('[globalSetup] Test database reset complete.');
}
