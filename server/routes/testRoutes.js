'use strict';

/**
 * testRoutes.js — Test-only endpoints for E2E test support.
 *
 * ONLY mounted when NODE_ENV === "test". Never deployed to production.
 *
 * Endpoints:
 *   POST /api/test/reset           — Wipe all test data collections
 *   POST /api/test/seed-user       — Create a pre-verified user, return JWT
 *   POST /api/test/trigger-poll    — Run A1 polling cycle synchronously
 *   GET  /api/test/report/:id      — Raw Report + ReportTagMetadata from DB
 *   GET  /api/test/location/:id    — Raw StudyLocation + LocationGroup from DB
 *   GET  /api/test/reports/:locId  — All Reports + Metadata for a location
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Report = require('../models/Report');
const ReportTagMetadata = require('../models/ReportTagMetadata');
const StudyLocation = require('../models/StudyLocation');
const LocationGroup = require('../models/LocationGroup');
const tokenService = require('../createJWT');
const { ReportProcessingService } = require('../services/reportProcessingService');

const router = express.Router();

// Each test route gets its own service instance so the poll cycle is isolated.
const reportProcessingService = new ReportProcessingService();

// ── POST /api/test/reset ──────────────────────────────────────────────────────
// Deletes all documents from every collection used by the pipeline.
// Call before (and optionally after) each test to guarantee isolation.
router.post('/reset', async (_req, res) => {
  try {
    await Promise.all([
      Report.deleteMany({}),
      ReportTagMetadata.deleteMany({}),
      StudyLocation.deleteMany({}),
      LocationGroup.deleteMany({}),
      User.deleteMany({ login: /^e2e-/ }),
    ]);
    return res.status(200).json({ ok: true, message: 'Test data reset.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── POST /api/test/seed-user ──────────────────────────────────────────────────
// Creates (or replaces) a fully verified user and returns a signed JWT.
// Body: { login, email, password }
router.post('/seed-user', async (req, res) => {
  try {
    const { login, email, password } = req.body ?? {};
    if (!login || !email || !password) {
      return res.status(400).json({ error: 'login, email, and password are required.' });
    }

    // Remove any stale copy from a previous run
    await User.deleteOne({ login });

    const userId = `e2e-${crypto.randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await new User({
      userId,
      login,
      email,
      passwordHash,
      firstName: 'E2E',
      lastName: 'Test',
      displayName: 'E2E Tester',
      hideLocation: false,
      pinColor: '#0F766E',
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      // 60 s in the past so "token issued now > passwordChangedAt" always holds
      passwordChangedAt: new Date(Date.now() - 60_000),
    }).save();

    const { accessToken } = tokenService.createToken(user.firstName, user.lastName, user.userId);

    return res.status(200).json({
      userId: user.userId,
      login: user.login,
      email: user.email,
      accessToken,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── POST /api/test/trigger-poll ───────────────────────────────────────────────
// Runs a single A1 polling cycle synchronously (no waiting for the 60-second
// timer). Use this to trigger archival / weight-factor updates in tests.
router.post('/trigger-poll', async (_req, res) => {
  try {
    await reportProcessingService.runPollingCycle(new Date());
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── GET /api/test/report/:reportId ────────────────────────────────────────────
// Returns the raw Report document and its ReportTagMetadata from the DB.
// Use this to verify computed fields that are not fully surfaced by the
// production API.
router.get('/report/:reportId', async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.reportId }).lean();
    const metadata = report
      ? await ReportTagMetadata.findOne({ reportId: report.reportId }).lean()
      : null;
    return res.status(200).json({ report: report ?? null, metadata: metadata ?? null });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── GET /api/test/location/:locationId ───────────────────────────────────────
// Returns the raw StudyLocation document and its parent LocationGroup.
// Use this to verify currentNoiseLevel / currentOccupancyLevel updates.
router.get('/location/:locationId', async (req, res) => {
  try {
    const location = await StudyLocation.findOne({
      studyLocationId: req.params.locationId,
    }).lean();
    const group = location
      ? await LocationGroup.findOne({ locationGroupId: location.locationGroupId }).lean()
      : null;
    return res.status(200).json({ location: location ?? null, group: group ?? null });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── GET /api/test/reports/:locationId ────────────────────────────────────────
// Returns ALL Report documents (live and archive_summary) for a location,
// together with their metadata records. Useful for verifying archival.
router.get('/reports/:locationId', async (req, res) => {
  try {
    const reports = await Report.find({ studyLocationId: req.params.locationId })
      .sort({ createdAt: -1 })
      .lean();

    const reportIds = reports.map((r) => r.reportId);
    const metadata =
      reportIds.length > 0
        ? await ReportTagMetadata.find({ reportId: { $in: reportIds } }).lean()
        : [];

    return res.status(200).json({ reports, metadata });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
