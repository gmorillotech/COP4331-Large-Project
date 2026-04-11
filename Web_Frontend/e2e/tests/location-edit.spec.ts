/**
 * location-edit.spec.ts — Admin location-group lifecycle tests (live app).
 *
 * Tests the full ordered sequence against https://studyspot.live:
 *   A. LocationEditPage loads and shows target group
 *   B. RedrawGroupPage loads and polygon is saved via API
 *   C. Split group via backend API (SplitGroupPage UI not yet on main branch)
 *   D. LocationEditPage merge: select the two split groups via UI → MergeDialog → confirm
 *
 * ── Deployment state (as of test run) ─────────────────────────────────────────
 *   DEPLOYED (in main branch bundle):
 *     LocationEditPage  — /admin/locations    (group list + merge)
 *     RedrawGroupPage   — /admin/redraw/:id   (polygon editor)
 *     MergeDialog       — triggered from LocationEditPage
 *     Backend APIs      — PUT shape, POST split, POST merge  (all routes live)
 *
 *   NOT YET DEPLOYED (feature branch, not on main):
 *     SplitGroupPage    — /admin/split/:id    (split-line editor not in bundle)
 *     GroupSelector split button              (group-selector__split-btn not in bundle)
 *
 *   CONSEQUENCE: Split is tested at the API level only (no page-load test for
 *   SplitGroupPage). All other flows are fully UI-tested.
 *
 * ── Why API for redraw/split, UI for merge ────────────────────────────────────
 *   RedrawGroupPage requires polygon drawing on a Google Maps canvas. There is no
 *   programmatic hook (no data-testid, no React ref). Driving the backend directly
 *   tests the full round-trip while still exercising every admin page route.
 *   MergeDialog is pure DOM and is fully automatable.
 *
 * ── Target group ──────────────────────────────────────────────────────────────
 *   "mud merged" (220bc1b2-c84b-4704-a6e5-08dafac863f7)
 *   Developer test group at lat ~28.596, lng ~-81.211 — geographically remote from
 *   real campus groups; safe to modify without affecting user-visible data.
 *
 *   Polygon (10 open vertices, exact copy from live DB):
 *     A (28.595986013295004, -81.211031)        index 0 ←─ split line start
 *     B (28.596255506647502, -81.21156262846903) index 1
 *     C (28.596546923361416, -81.21211693851285) index 2
 *     D (28.596794493352498, -81.21156262846903) index 3
 *     E (28.597063986704995, -81.211031)         index 4 ←─ split line end
 *     F (28.596794493352498, -81.21049937153099) index 5
 *     G (28.596738669672813, -81.20988513624414) index 6
 *     H (28.5965425387584,   -81.2092709006046)  index 7
 *     I (28.596355176699372, -81.20978526055153) index 8
 *     J (28.596255506647502, -81.21049937153099) index 9
 *
 *   Split line — vertex A (index 0) to vertex E (index 4):
 *     Vertical chord at longitude -81.211031.
 *     Child A (west, A→B→C→D→E): receives "mud-roo" at (28.5965253, -81.2110312).
 *     Child B (east, E→F→G→H→I→J→A): no child locations.
 *     "mud-roo" distance from split line = 2e-7° (outside epsilon=1e-7 boundary
 *     check) → classified as interior point of child A. ✓
 *
 * ── State after full run ──────────────────────────────────────────────────────
 *   "mud merged" (220bc1b2-...) is replaced by merged group named MERGED_GROUP_NAME.
 *   "mud west" and "mud east" are deleted (consumed by merge).
 *   "mud-roo" is reassigned to the new merged group.
 *   Re-run requires manually restoring the original "mud merged" group.
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *   LIVE_ADMIN_LOGIN     admin account login name
 *   LIVE_ADMIN_PASSWORD  admin account password
 */

import { test, expect, request } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  loginWithPassword,
  getLocationGroups,
  adminPutGroupShape,
  adminSplitGroup,
} from '../helpers/apiClient.js';
import type { LocationGroupVertex } from '../helpers/apiClient.js';

// ── Live config ────────────────────────────────────────────────────────────────

const LIVE_API_URL   = process.env.LIVE_BASE_URL  ?? 'https://studyspot.live';
const ADMIN_LOGIN    = process.env.LIVE_ADMIN_LOGIN    ?? '';
const ADMIN_PASSWORD = process.env.LIVE_ADMIN_PASSWORD ?? '';

// ── Target group ───────────────────────────────────────────────────────────────

// NOTE: TARGET_GROUP_ID is resolved dynamically in beforeAll because each full
// lifecycle run (split → merge) replaces the original group with a new UUID.
// Hardcoding the ID would break on the second run.
const TARGET_GROUP_NAME = 'mud merged';

// ── Geometry ───────────────────────────────────────────────────────────────────

const MUD_MERGED_POLYGON: LocationGroupVertex[] = [
  { latitude: 28.595986013295004,  longitude: -81.211031            }, // A
  { latitude: 28.596255506647502,  longitude: -81.21156262846903     }, // B
  { latitude: 28.596546923361416,  longitude: -81.21211693851285     }, // C
  { latitude: 28.596794493352498,  longitude: -81.21156262846903     }, // D
  { latitude: 28.597063986704995,  longitude: -81.211031            }, // E
  { latitude: 28.596794493352498,  longitude: -81.21049937153099     }, // F
  { latitude: 28.596738669672813,  longitude: -81.20988513624414     }, // G
  { latitude: 28.5965425387584,    longitude: -81.2092709006046      }, // H
  { latitude: 28.596355176699372,  longitude: -81.20978526055153     }, // I
  { latitude: 28.596255506647502,  longitude: -81.21049937153099     }, // J
];

/** Vertical chord from vertex A (index 0) to vertex E (index 4) at lng -81.211031 */
const MUD_MERGED_SPLIT_LINE: LocationGroupVertex[] = [
  { latitude: 28.595986013295004, longitude: -81.211031 }, // A
  { latitude: 28.597063986704995, longitude: -81.211031 }, // E
];

const SPLIT_GROUP_A_NAME = 'mud west';  // childA = west (A,B,C,D,E); contains mud-roo
const SPLIT_GROUP_B_NAME = 'mud east';  // childB = east (E,F,G,H,I,J,A); no children
const MERGED_GROUP_NAME  = 'mud merged'; // restored name after merge

// ── Auth helper ────────────────────────────────────────────────────────────────

async function authenticateAdmin(page: Page): Promise<string> {
  if (!ADMIN_LOGIN || !ADMIN_PASSWORD) {
    throw new Error(
      'Set LIVE_ADMIN_LOGIN and LIVE_ADMIN_PASSWORD env vars before running live tests.',
    );
  }

  const api = await request.newContext({ baseURL: LIVE_API_URL });
  let token: string;
  let user: { role: string; displayName: string; login: string };

  try {
    const result = await loginWithPassword(api, LIVE_API_URL, ADMIN_LOGIN, ADMIN_PASSWORD);
    token = result.accessToken;
    user  = result.user;
  } finally {
    await api.dispose();
  }

  if (user.role !== 'admin') {
    throw new Error(`Account "${ADMIN_LOGIN}" has role "${user.role}" — must be "admin".`);
  }

  await page.goto('/');
  await page.evaluate(
    ({ tok, role, displayName, login }) => {
      localStorage.setItem('token', tok);
      localStorage.setItem('user_data', JSON.stringify({ role, displayName, login }));
    },
    { tok: token, role: user.role, displayName: user.displayName, login: user.login },
  );

  return token;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe.serial('Location-group lifecycle: redraw → split → merge', () => {

  // Resolved once in beforeAll — stays valid for the entire describe block.
  let targetGroupId = '';

  test.beforeAll(async () => {
    // Discover the current ID of TARGET_GROUP_NAME. The ID changes after every
    // lifecycle run because the merge operation creates a new group with a fresh
    // UUID. Hardcoding it would break on re-runs.
    const api = await request.newContext({ baseURL: LIVE_API_URL });
    let token: string;
    try {
      const auth = await loginWithPassword(api, LIVE_API_URL, ADMIN_LOGIN, ADMIN_PASSWORD);
      token = auth.accessToken;
      const groups = await getLocationGroups(api, LIVE_API_URL, token);
      const target = groups.find((g) => g.name === TARGET_GROUP_NAME);
      if (!target) {
        throw new Error(
          `"${TARGET_GROUP_NAME}" not found in live DB. ` +
          `Available names: ${groups.map((g) => g.name).join(', ')}`,
        );
      }
      targetGroupId = target.locationGroupId;
      console.log(`[location-edit] Resolved "${TARGET_GROUP_NAME}" → ${targetGroupId}`);
    } finally {
      await api.dispose();
    }
  });

  // ── A: LocationEditPage + Redraw ─────────────────────────────────────────

  test('A1 — LocationEditPage: loads and shows target group with Redraw button', async ({ page }) => {
    await authenticateAdmin(page);
    await page.goto('/admin/locations');

    await expect(page.locator('.location-edit-sidebar')).toBeVisible();
    await expect(page.locator('.group-selector__list')).toBeVisible();

    // Filter to "mud" to quickly find the target group
    await page.fill('.group-selector__search-input', 'mud');
    await expect(
      page.locator('.group-selector__name', { hasText: TARGET_GROUP_NAME }),
    ).toBeVisible({ timeout: 15_000 });

    // Redraw button present (Split button is on a feature branch, not yet in main)
    const targetItem = page.locator('.group-selector__item').filter({ hasText: TARGET_GROUP_NAME });
    await expect(targetItem.locator('.group-selector__redraw-btn')).toBeVisible();

    // Selection counter at zero, Merge button disabled
    await expect(page.locator('.location-edit-sidebar__selection-count'))
      .toHaveText('0/2 groups selected');
    await expect(page.locator('button:has-text("Merge Groups")')).toBeDisabled();
  });

  test('A2 — RedrawGroupPage: navigates from Redraw button and renders correctly', async ({ page }) => {
    await authenticateAdmin(page);
    await page.goto('/admin/locations');

    await page.fill('.group-selector__search-input', 'mud');
    const targetItem = page.locator('.group-selector__item').filter({ hasText: TARGET_GROUP_NAME });
    await expect(targetItem).toBeVisible({ timeout: 15_000 });
    await targetItem.locator('.group-selector__redraw-btn').click();

    // Wait for the RedrawGroupPage title — confirms navigation succeeded.
    // Avoid waitForURL here: Google Maps keeps fetching tiles so the 'load'
    // event never fires, causing a false timeout even though navigation worked.
    await expect(page.locator('.redraw-topbar__title'))
      .toHaveText(`Redraw: ${TARGET_GROUP_NAME}`, { timeout: 15_000 });

    // URL matches /admin/redraw/<resolved-id>
    await expect(page).toHaveURL(new RegExp(`/admin/redraw/${targetGroupId}`));

    // Save and Cancel buttons
    const actions = page.locator('.redraw-topbar__actions');
    await expect(actions.locator('button:has-text("Cancel")')).toBeVisible();
    await expect(actions.locator('button:has-text("Save")')).toBeVisible();

    // Map container rendered, loading state resolved
    await expect(page.locator('.redraw-map-container')).toBeVisible();
    await expect(page.locator('.redraw-loading')).not.toBeVisible({ timeout: 15_000 });

    // Cancel navigates back
    await actions.locator('button:has-text("Cancel")').click();
    await expect(page.locator('.group-selector__list')).toBeVisible({ timeout: 15_000 });
  });

  test('A3 — Redraw: PUT valid polygon via API, shape saved, group still in sidebar', async ({ page }) => {
    const token = await authenticateAdmin(page);

    const api = await request.newContext({ baseURL: LIVE_API_URL });
    let result: Awaited<ReturnType<typeof adminPutGroupShape>>;
    try {
      result = await adminPutGroupShape(api, LIVE_API_URL, token, targetGroupId, MUD_MERGED_POLYGON);
    } finally {
      await api.dispose();
    }

    expect(result.message).toBe('Shape updated');
    expect(result.group.shapeType).toBe('polygon');
    // Backend auto-closes: 10 open vertices → 11 stored (including closing vertex)
    expect(result.group.polygon).toHaveLength(MUD_MERGED_POLYGON.length + 1);

    // UI: group still visible in sidebar
    await page.goto('/admin/locations');
    await page.fill('.group-selector__search-input', 'mud');
    await expect(
      page.locator('.group-selector__name', { hasText: TARGET_GROUP_NAME }),
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── B: Split via backend API ──────────────────────────────────────────────

  test('B — Split: POST split via API creates two groups, original group removed', async ({ page }) => {
    // NOTE: SplitGroupPage UI (/admin/split/:id) and the sidebar split button are not
    // yet deployed on the main branch. The backend endpoint is fully operational and
    // tested here. The UI page test will be added once the feature branch is merged.
    const token = await authenticateAdmin(page);

    const api = await request.newContext({ baseURL: LIVE_API_URL });
    let result: Awaited<ReturnType<typeof adminSplitGroup>>;
    try {
      result = await adminSplitGroup(api, LIVE_API_URL, token, targetGroupId, {
        parentPolygon: MUD_MERGED_POLYGON,
        splitLine:     MUD_MERGED_SPLIT_LINE,
        destinationGroups: [
          { name: SPLIT_GROUP_A_NAME }, // childA = west (A,B,C,D,E); contains mud-roo
          { name: SPLIT_GROUP_B_NAME }, // childB = east (E,F,G,H,I,J,A); no children
        ],
      });
    } finally {
      await api.dispose();
    }

    expect(result.message).toBe('Group split');
    expect(result.groupA.name).toBe(SPLIT_GROUP_A_NAME);
    expect(result.groupB.name).toBe(SPLIT_GROUP_B_NAME);
    expect(result.deletedGroupId).toBe(targetGroupId);

    // Both child groups have polygons from the split computation
    expect(Array.isArray(result.groupA.polygon)).toBe(true);
    expect((result.groupA.polygon ?? []).length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(result.groupB.polygon)).toBe(true);
    expect((result.groupB.polygon ?? []).length).toBeGreaterThanOrEqual(4);

    // UI: sidebar reflects the split — 2 new groups, original gone
    await page.goto('/admin/locations');
    await page.fill('.group-selector__search-input', 'mud');

    await expect(
      page.locator('.group-selector__name', { hasText: SPLIT_GROUP_A_NAME }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('.group-selector__name', { hasText: SPLIT_GROUP_B_NAME }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('.group-selector__name', { hasText: TARGET_GROUP_NAME }),
    ).not.toBeVisible();
  });

  // ── C: Merge via full UI ──────────────────────────────────────────────────

  test('C — Merge: select both split groups via sidebar, confirm via MergeDialog', async ({ page }) => {
    await authenticateAdmin(page);
    await page.goto('/admin/locations');

    await expect(page.locator('.group-selector__list')).toBeVisible({ timeout: 15_000 });
    await page.fill('.group-selector__search-input', 'mud');

    // ── Select Group A ────────────────────────────────────────────────────
    const itemA = page.locator('.group-selector__item').filter({ hasText: SPLIT_GROUP_A_NAME });
    await expect(itemA).toBeVisible({ timeout: 10_000 });
    await itemA.click();
    await expect(page.locator('.location-edit-sidebar__selection-count'))
      .toHaveText('1/2 groups selected');

    // ── Select Group B ────────────────────────────────────────────────────
    const itemB = page.locator('.group-selector__item').filter({ hasText: SPLIT_GROUP_B_NAME });
    await expect(itemB).toBeVisible();
    await itemB.click();
    await expect(page.locator('.location-edit-sidebar__selection-count'))
      .toHaveText('2/2 groups selected');

    // Both names shown in the footer
    await expect(page.locator('.location-edit-sidebar__selected-names'))
      .toContainText(SPLIT_GROUP_A_NAME);
    await expect(page.locator('.location-edit-sidebar__selected-names'))
      .toContainText(SPLIT_GROUP_B_NAME);

    // Merge button enabled
    const mergeBtn = page.locator('button:has-text("Merge Groups")');
    await expect(mergeBtn).toBeEnabled();
    await mergeBtn.click();

    // ── MergeDialog ───────────────────────────────────────────────────────
    await expect(page.locator('.merge-dialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.merge-dialog__header h3')).toHaveText('Merge Groups');
    await expect(page.locator('.merge-dialog__body')).toContainText(SPLIT_GROUP_A_NAME);
    await expect(page.locator('.merge-dialog__body')).toContainText(SPLIT_GROUP_B_NAME);

    // Use a custom name for the merged group
    await page.click('#merge-name-custom');
    await expect(page.locator('.merge-dialog__custom-name-input')).toBeVisible();
    await page.fill('.merge-dialog__custom-name-input', MERGED_GROUP_NAME);

    const confirmBtn = page.locator('.merge-dialog__footer .btn-primary');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // ── Post-merge navigation ─────────────────────────────────────────────
    // merge controller returns requiresRedraw: false → navigates to /admin/locations
    await page.waitForURL(/\/admin\/locations/, { timeout: 30_000 });

    // Merged group now appears in sidebar
    await page.fill('.group-selector__search-input', MERGED_GROUP_NAME);
    await expect(
      page.locator('.group-selector__name', { hasText: MERGED_GROUP_NAME }),
    ).toBeVisible({ timeout: 15_000 });

    // Split groups are gone
    await page.fill('.group-selector__search-input', 'mud');
    await expect(
      page.locator('.group-selector__name', { hasText: SPLIT_GROUP_A_NAME }),
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.group-selector__name', { hasText: SPLIT_GROUP_B_NAME }),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
