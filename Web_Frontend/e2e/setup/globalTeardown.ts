import { request } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5050';

export default async function globalTeardown(): Promise<void> {
  try {
    const ctx = await request.newContext({ baseURL: BACKEND_URL });
    await ctx.post('/api/test/reset');
    await ctx.dispose();
    console.log('[globalTeardown] Test database cleaned up.');
  } catch (err) {
    // Best-effort cleanup — don't fail the run
    console.warn('[globalTeardown] Cleanup warning:', err);
  }
}
