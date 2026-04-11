'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';

/**
 * adminSearchRoutes.test.js
 *
 * Unit tests for the admin search + report management endpoints:
 *   GET  /api/admin/search
 *   GET  /api/admin/reports/active
 *   DELETE /api/admin/reports/:reportId
 *
 * The router is factory-based (createAdminSearchRouter), so auth middleware
 * and the controller are injected as mocks — no module-level jest.mock needed.
 */

const express = require('express');
const supertest = require('supertest');
const { createAdminSearchRouter } = require('../../routes/adminSearchRoutes');

// ── Shared middleware stubs ───────────────────────────────────────────────────

/** Simulates an authenticated admin passing protect + requireAdmin. */
const mockProtect = (req, _res, next) => {
  req.user = { userId: 'admin-1', role: 'admin' };
  next();
};
const mockRequireAdmin = (_req, _res, next) => next();

/** Simulates an unauthenticated request (protect rejects it). */
const rejectProtect = (_req, res) => res.status(401).json({ error: 'Unauthorized' });

// ── App factory ──────────────────────────────────────────────────────────────

function buildApp(controllerOverrides = {}, { authenticated = true } = {}) {
  const controller = {
    search:           jest.fn((_req, res) => res.status(200).json({ results: [] })),
    getActiveReports: jest.fn((_req, res) => res.status(200).json({ reports: [], total: 0 })),
    deleteReport:     jest.fn((_req, res) => res.status(200).json({ message: 'Report deleted', reportId: 'r-1' })),
    ...controllerOverrides,
  };

  const router = createAdminSearchRouter({
    protectMiddleware:      authenticated ? mockProtect : rejectProtect,
    requireAdminMiddleware: mockRequireAdmin,
    controller,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', router);
  return { app, controller };
}

// ── GET /api/admin/search ─────────────────────────────────────────────────────

describe('GET /api/admin/search', () => {
  it('returns 200 with search results', async () => {
    const fakeResults = { locations: [{ id: 'loc-1' }], total: 1 };
    const { app } = buildApp({
      search: jest.fn((_req, res) => res.status(200).json(fakeResults)),
    });

    const res = await supertest(app).get('/api/admin/search?q=library');

    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(1);
  });

  it('calls the controller search handler exactly once', async () => {
    const { app, controller } = buildApp();

    await supertest(app).get('/api/admin/search');

    expect(controller.search).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const { app } = buildApp({}, { authenticated: false });

    const res = await supertest(app).get('/api/admin/search');

    expect(res.status).toBe(401);
  });

  it('returns 500 when the controller throws', async () => {
    const { app } = buildApp({
      search: jest.fn((_req, res) =>
        res.status(500).json({ error: 'Server error during search.' })
      ),
    });

    const res = await supertest(app).get('/api/admin/search');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/server error/i);
  });
});

// ── GET /api/admin/reports/active ─────────────────────────────────────────────

describe('GET /api/admin/reports/active', () => {
  it('returns 200 with an empty reports list when there are no active reports', async () => {
    const { app } = buildApp();

    const res = await supertest(app).get('/api/admin/reports/active');

    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('forwards groupId and locationId query params to the controller', async () => {
    const { app, controller } = buildApp();

    await supertest(app).get('/api/admin/reports/active?groupId=g-1&locationId=loc-1');

    const [req] = controller.getActiveReports.mock.calls[0];
    expect(req.query.groupId).toBe('g-1');
    expect(req.query.locationId).toBe('loc-1');
  });

  it('returns 200 with enriched report data', async () => {
    const report = {
      reportId: 'r-1',
      studyLocationId: 'loc-1',
      avgNoise: 55,
      occupancy: 3,
      locationName: 'North Reading Room',
      reporterDisplayName: 'Alice',
    };
    const { app } = buildApp({
      getActiveReports: jest.fn((_req, res) =>
        res.status(200).json({ reports: [report], total: 1 })
      ),
    });

    const res = await supertest(app).get('/api/admin/reports/active');

    expect(res.status).toBe(200);
    expect(res.body.reports[0].locationName).toBe('North Reading Room');
  });

  it('returns 401 when unauthenticated', async () => {
    const { app } = buildApp({}, { authenticated: false });

    const res = await supertest(app).get('/api/admin/reports/active');

    expect(res.status).toBe(401);
  });
});

// ── DELETE /api/admin/reports/:reportId ───────────────────────────────────────

describe('DELETE /api/admin/reports/:reportId', () => {
  it('returns 200 with confirmation message on successful deletion', async () => {
    const { app } = buildApp();

    const res = await supertest(app).delete('/api/admin/reports/r-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Report deleted');
    expect(res.body.reportId).toBe('r-1');
  });

  it('returns 404 when the report does not exist', async () => {
    const { app } = buildApp({
      deleteReport: jest.fn((_req, res) =>
        res.status(404).json({ error: 'Report not found' })
      ),
    });

    const res = await supertest(app).delete('/api/admin/reports/ghost');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('forwards the reportId path parameter to the controller', async () => {
    const { app, controller } = buildApp();

    await supertest(app).delete('/api/admin/reports/my-report-id');

    const [req] = controller.deleteReport.mock.calls[0];
    expect(req.params.reportId).toBe('my-report-id');
  });

  it('returns 401 when unauthenticated', async () => {
    const { app } = buildApp({}, { authenticated: false });

    const res = await supertest(app).delete('/api/admin/reports/r-1');

    expect(res.status).toBe(401);
  });

  it('returns 500 when the controller signals a server error', async () => {
    const { app } = buildApp({
      deleteReport: jest.fn((_req, res) =>
        res.status(500).json({ error: 'Server error deleting report.' })
      ),
    });

    const res = await supertest(app).delete('/api/admin/reports/r-1');

    expect(res.status).toBe(500);
  });
});
