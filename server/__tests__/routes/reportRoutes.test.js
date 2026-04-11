'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';

const express = require('express');
const supertest = require('supertest');
const { createReportRouter } = require('../../routes/reportRoutes');

// ── Mock building blocks ──────────────────────────────────────────────────────

function makeReport(overrides = {}) {
  return {
    reportId: 'report-1',
    studyLocationId: 'loc-1',
    userId: 'user-1',
    avgNoise: 50,
    maxNoise: 65,
    variance: 5,
    occupancy: 2,
    reportKind: 'live',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a Mongoose-style chainable query: .sort().limit() → Promise */
function makeChainable(resolvedValue) {
  const chainable = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(resolvedValue),
  };
  return chainable;
}

function makeMockReportModel(reports = [makeReport()]) {
  return {
    find: jest.fn().mockReturnValue(makeChainable(reports)),
  };
}

function makeMockService(overrides = {}) {
  return {
    submitCanonicalReport: jest.fn().mockResolvedValue({
      report: makeReport(),
      metadata: {},
      studyLocation: { studyLocationId: 'loc-1', name: 'Room A' },
      locationGroup: { locationGroupId: 'grp-1', name: 'Library' },
      cycle: {},
    }),
    listArchivedSummariesByLocation: jest.fn().mockResolvedValue([]),
    getHistoricalBaseline: jest.fn().mockResolvedValue({
      usualNoise: 48,
      usualOccupancy: 2,
    }),
    ...overrides,
  };
}

// Middleware stubs
const authMiddleware = (req, _res, next) => {
  req.user = { userId: 'user-1' };
  next();
};

const noopMiddleware = (_req, _res, next) => next();

function buildApp(reportModelOverrides, serviceOverrides, options = {}) {
  const ReportModel = makeMockReportModel(options.reports);
  const reportProcessingService = makeMockService(serviceOverrides);

  const router = createReportRouter({
    ReportModel,
    reportProcessingService,
    optionalProtectMiddleware: options.anonymous ? noopMiddleware : authMiddleware,
    protectMiddleware: authMiddleware,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reports', router);
  return { app, ReportModel, reportProcessingService };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Report Routes', () => {
  // ── POST /api/reports ────────────────────────────────────────
  describe('POST /api/reports', () => {
    it('returns 400 when required fields are missing', async () => {
      const { app } = buildApp();
      const res = await supertest(app)
        .post('/api/reports')
        .send({ studyLocationId: 'loc-1' }); // missing avgNoise etc.
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 201 with processed report on valid submission (authenticated)', async () => {
      const { app, reportProcessingService } = buildApp();
      const res = await supertest(app)
        .post('/api/reports')
        .send({
          studyLocationId: 'loc-1',
          avgNoise: 50,
          maxNoise: 65,
          variance: 5,
          occupancy: 2,
        });
      expect(res.status).toBe(201);
      expect(reportProcessingService.submitCanonicalReport).toHaveBeenCalledWith(
        expect.objectContaining({ studyLocationId: 'loc-1', userId: 'user-1' }),
      );
    });

    it('returns 201 and passes null userId when unauthenticated and no userId in body', async () => {
      const { app, reportProcessingService } = buildApp({}, {}, { anonymous: true });
      const res = await supertest(app)
        .post('/api/reports')
        .send({ studyLocationId: 'loc-1', avgNoise: 50, maxNoise: 65, variance: 5, occupancy: 2 });
      expect(res.status).toBe(201);
      expect(reportProcessingService.submitCanonicalReport).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });

    it('returns 201 and uses bodyUserId when unauthenticated but userId provided in body', async () => {
      const { app, reportProcessingService } = buildApp({}, {}, { anonymous: true });
      const res = await supertest(app)
        .post('/api/reports')
        .send({
          studyLocationId: 'loc-1',
          avgNoise: 50,
          maxNoise: 65,
          variance: 5,
          occupancy: 2,
          userId: 'device-user',
        });
      expect(res.status).toBe(201);
      expect(reportProcessingService.submitCanonicalReport).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'device-user' }),
      );
    });

    it('returns 500 when reportProcessingService throws', async () => {
      const { app } = buildApp(
        {},
        { submitCanonicalReport: jest.fn().mockRejectedValue(new Error('DB error')) },
      );
      const res = await supertest(app)
        .post('/api/reports')
        .send({ studyLocationId: 'loc-1', avgNoise: 50, maxNoise: 65, variance: 5, occupancy: 2 });
      expect(res.status).toBe(500);
    });

    it('coerces numeric string fields to numbers', async () => {
      const { app, reportProcessingService } = buildApp();
      await supertest(app)
        .post('/api/reports')
        .send({
          studyLocationId: 'loc-1',
          avgNoise: '50',
          maxNoise: '65',
          variance: '5',
          occupancy: '2',
        });
      expect(reportProcessingService.submitCanonicalReport).toHaveBeenCalledWith(
        expect.objectContaining({ avgNoise: 50, maxNoise: 65, variance: 5, occupancy: 2 }),
      );
    });
  });

  // ── GET /api/reports/recent ──────────────────────────────────
  describe('GET /api/reports/recent', () => {
    it('returns 200 with an array of recent live reports', async () => {
      const reports = [makeReport(), makeReport({ reportId: 'r2' })];
      const { app, ReportModel } = buildApp({}, {}, { reports });
      const res = await supertest(app).get('/api/reports/recent');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(ReportModel.find).toHaveBeenCalledWith({ reportKind: 'live' });
    });

    it('returns 500 when the model throws', async () => {
      const { app } = buildApp();
      const { ReportModel } = buildApp();
      ReportModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('db error')),
      });
      // Build a fresh app with the broken model
      const brokenRouter = createReportRouter({
        ReportModel,
        reportProcessingService: makeMockService(),
        protectMiddleware: authMiddleware,
        optionalProtectMiddleware: authMiddleware,
      });
      const brokenApp = express();
      brokenApp.use(express.json());
      brokenApp.use('/api/reports', brokenRouter);

      const res = await supertest(brokenApp).get('/api/reports/recent');
      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/reports/location/:locationId ────────────────────
  describe('GET /api/reports/location/:locationId', () => {
    it('returns 200 with reports for the given location', async () => {
      const { app, ReportModel } = buildApp();
      const res = await supertest(app).get('/api/reports/location/loc-1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(ReportModel.find).toHaveBeenCalledWith({
        studyLocationId: 'loc-1',
        reportKind: 'live',
      });
    });

    it('limits results to 20 records', async () => {
      const { app, ReportModel } = buildApp();
      await supertest(app).get('/api/reports/location/loc-1');
      const chain = ReportModel.find.mock.results[0].value;
      expect(chain.limit).toHaveBeenCalledWith(20);
    });
  });

  // ── GET /api/reports/history/:locationId ────────────────────
  describe('GET /api/reports/history/:locationId', () => {
    it('returns 200 with archived summaries', async () => {
      const { app, reportProcessingService } = buildApp();
      const res = await supertest(app).get('/api/reports/history/loc-1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(reportProcessingService.listArchivedSummariesByLocation).toHaveBeenCalledWith(
        'loc-1',
        expect.objectContaining({ from: null, to: null }),
      );
    });

    it('returns 400 when "from" date is invalid', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/reports/history/loc-1?from=not-a-date');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/date range/i);
    });

    it('returns 400 when "to" date is invalid', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/reports/history/loc-1?to=garbage');
      expect(res.status).toBe(400);
    });

    it('passes parsed date range to the service', async () => {
      const { app, reportProcessingService } = buildApp();
      await supertest(app).get('/api/reports/history/loc-1?from=2024-01-01&to=2024-01-31');
      const [, opts] = reportProcessingService.listArchivedSummariesByLocation.mock.calls[0];
      expect(opts.from).toBeInstanceOf(Date);
      expect(opts.to).toBeInstanceOf(Date);
    });
  });

  // ── GET /api/reports/baseline/:locationId ────────────────────
  describe('GET /api/reports/baseline/:locationId', () => {
    it('returns 200 with baseline data', async () => {
      const { app, reportProcessingService } = buildApp();
      const res = await supertest(app).get('/api/reports/baseline/loc-1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('usualNoise');
      expect(res.body).toHaveProperty('usualOccupancy');
      expect(reportProcessingService.getHistoricalBaseline).toHaveBeenCalled();
    });

    it('returns 400 when the "at" parameter is not a valid date', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/reports/baseline/loc-1?at=invalid-date');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/'at'/i);
    });

    it('returns { usualNoise: null, usualOccupancy: null } when no baseline exists', async () => {
      const { app } = buildApp(
        {},
        { getHistoricalBaseline: jest.fn().mockResolvedValue(null) },
      );
      const res = await supertest(app).get('/api/reports/baseline/loc-1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ usualNoise: null, usualOccupancy: null });
    });

    it('uses current date when "at" is not specified', async () => {
      const before = Date.now();
      const { app, reportProcessingService } = buildApp();
      await supertest(app).get('/api/reports/baseline/loc-1');
      const after = Date.now();
      const [, atDate] = reportProcessingService.getHistoricalBaseline.mock.calls[0];
      expect(atDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(atDate.getTime()).toBeLessThanOrEqual(after);
    });
  });
});
