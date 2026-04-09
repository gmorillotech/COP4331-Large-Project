'use strict';

const express = require('express');
const supertest = require('supertest');
const { createLocationRouter } = require('../../routes/locationRoutes');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGroup(overrides = {}) {
  return {
    locationGroupId: 'grp-1',
    name: 'Library',
    centerLatitude: 28.6002,
    centerLongitude: -81.2018,
    radiusMeters: 100,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeLocation(overrides = {}) {
  return {
    studyLocationId: 'loc-1',
    locationGroupId: 'grp-1',
    name: 'Study Room A',
    floorLabel: 'Floor 1',
    sublocationLabel: '',
    latitude: 28.6002,
    longitude: -81.2018,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

// ── Mongoose model mocks ──────────────────────────────────────────────────────
//
// The repositories call Model.find().lean(), Model.findOne({...}).lean(),
// and Model.findOneAndUpdate({...}, {...}, opts).lean().
// loadSearchSource also calls Model.find().lean() and Model.bulkWrite().

function makeFindQuery(resolvedValue) {
  return { lean: jest.fn().mockResolvedValue(resolvedValue) };
}

/**
 * Build fake Mongoose-ish model objects.
 * `find` returns an array of plain objects (lean docs).
 * `findOne` returns one plain object or null.
 * `findOneAndUpdate` returns the upserted doc.
 * `bulkWrite` is a no-op.
 */
function buildMockModels({ groups = [makeGroup()], locations = [makeLocation()] } = {}) {
  const StudyLocationModel = {
    find: jest.fn().mockReturnValue(makeFindQuery(locations)),
    findOne: jest.fn().mockReturnValue(makeFindQuery(locations[0] ?? null)),
    findOneAndUpdate: jest.fn().mockReturnValue(makeFindQuery(locations[0] ?? null)),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };

  const LocationGroupModel = {
    find: jest.fn().mockReturnValue(makeFindQuery(groups)),
    findOne: jest.fn().mockReturnValue(makeFindQuery(groups[0] ?? null)),
    findOneAndUpdate: jest.fn().mockReturnValue(makeFindQuery(groups[0] ?? null)),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };

  return { StudyLocationModel, LocationGroupModel };
}

function buildApp(mockOverrides = {}) {
  const { StudyLocationModel, LocationGroupModel } = buildMockModels(mockOverrides);
  const router = createLocationRouter({ StudyLocationModel, LocationGroupModel });
  const app = express();
  app.use(express.json());
  app.use('/api/locations', router);
  return { app, StudyLocationModel, LocationGroupModel };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Location Routes', () => {
  // ── GET /api/locations/groups ────────────────────────────────
  describe('GET /api/locations/groups', () => {
    it('returns 200 with an array of location groups', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/groups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns groups sorted alphabetically', async () => {
      const { app } = buildApp({
        groups: [
          makeGroup({ locationGroupId: 'g2', name: 'Zeta Hall' }),
          makeGroup({ locationGroupId: 'g1', name: 'Alpha Hall' }),
        ],
      });
      const res = await supertest(app).get('/api/locations/groups');
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('Alpha Hall');
    });

    it('returns 200 with an empty array when no groups exist', async () => {
      const { app } = buildApp({ groups: [], locations: [] });
      const res = await supertest(app).get('/api/locations/groups');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── POST /api/locations/groups ───────────────────────────────
  describe('POST /api/locations/groups', () => {
    it('returns 400 when the group name is missing', async () => {
      const { app } = buildApp({ groups: [] });
      const res = await supertest(app)
        .post('/api/locations/groups')
        .send({
          centerLatitude: 28.6,
          centerLongitude: -81.2,
          creatorLatitude: 28.6,
          creatorLongitude: -81.2,
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 when center coordinates are missing', async () => {
      const { app } = buildApp({ groups: [] });
      const res = await supertest(app)
        .post('/api/locations/groups')
        .send({
          name: 'New Hall',
          creatorLatitude: 28.6,
          creatorLongitude: -81.2,
        });
      expect(res.status).toBe(400);
    });

    it('returns 201 with the created group on success', async () => {
      const newGroup = makeGroup({ locationGroupId: 'group-new-hall', name: 'New Hall' });
      const { app, LocationGroupModel } = buildApp({ groups: [], locations: [] });
      LocationGroupModel.findOneAndUpdate.mockReturnValue(makeFindQuery(newGroup));

      const res = await supertest(app)
        .post('/api/locations/groups')
        .send({
          name: 'New Hall',
          centerLatitude: 28.6002,
          centerLongitude: -81.2018,
          creatorLatitude: 28.6002,
          creatorLongitude: -81.2018,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('locationGroupId');
    });
  });

  // ── GET /api/locations/groups/:groupId/locations ─────────────
  describe('GET /api/locations/groups/:groupId/locations', () => {
    it('returns 200 with locations belonging to the group', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/groups/grp-1/locations');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns an empty array when no locations exist for that group', async () => {
      const { app } = buildApp({ locations: [] });
      const res = await supertest(app).get('/api/locations/groups/grp-1/locations');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── POST /api/locations/groups/:groupId/locations ────────────
  describe('POST /api/locations/groups/:groupId/locations', () => {
    it('returns 400 when the location name is missing', async () => {
      const { app } = buildApp();
      const res = await supertest(app)
        .post('/api/locations/groups/grp-1/locations')
        .send({ latitude: 28.6002, longitude: -81.2018 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when latitude/longitude are invalid', async () => {
      const { app } = buildApp();
      const res = await supertest(app)
        .post('/api/locations/groups/grp-1/locations')
        .send({ name: 'Room', latitude: 'abc', longitude: 'xyz' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when the group does not exist', async () => {
      const { app, LocationGroupModel } = buildApp();
      LocationGroupModel.findOne.mockReturnValue(makeFindQuery(null));

      const res = await supertest(app)
        .post('/api/locations/groups/grp-missing/locations')
        .send({ name: 'Room', latitude: 28.6, longitude: -81.2 });
      expect(res.status).toBe(404);
    });

    it('returns 201 with the created location on success', async () => {
      const savedLoc = makeLocation({ studyLocationId: 'library-study-room-a' });
      const { app, StudyLocationModel } = buildApp({
        locations: [], // no existing locations so no duplicate check
      });
      StudyLocationModel.findOneAndUpdate.mockReturnValue(makeFindQuery(savedLoc));

      const res = await supertest(app)
        .post('/api/locations/groups/grp-1/locations')
        .send({
          name: 'Study Room A',
          latitude: 28.6002,
          longitude: -81.2018,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('studyLocationId');
    });
  });

  // ── GET /api/locations/search ────────────────────────────────
  describe('GET /api/locations/search', () => {
    it('returns 200 with results and source fields', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/search');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('source');
    });

    it('returns results filtered by query string', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/search?q=library');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('respects includeGroups=false', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/search?includeGroups=false');
      expect(res.status).toBe(200);
      const groupResults = res.body.results.filter((r) => r.kind === 'group');
      expect(groupResults).toHaveLength(0);
    });

    it('respects includeLocations=false', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/search?includeLocations=false');
      expect(res.status).toBe(200);
      const locationResults = res.body.results.filter((r) => r.kind === 'location');
      expect(locationResults).toHaveLength(0);
    });

    it('falls back to catalog source when models throw', async () => {
      const { StudyLocationModel, LocationGroupModel } = buildMockModels();
      StudyLocationModel.find.mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('db error')) });

      const router = createLocationRouter({ StudyLocationModel, LocationGroupModel });
      const app = express();
      app.use(express.json());
      app.use('/api/locations', router);

      const res = await supertest(app).get('/api/locations/search');
      // loadSearchSource swallows the error and falls back to catalog data
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('catalog');
    });
  });

  // ── GET /api/locations/closest ───────────────────────────────
  describe('GET /api/locations/closest', () => {
    it('returns 400 when lat/lng query params are missing', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/closest');
      expect(res.status).toBe(400);
    });

    it('returns 400 when lat/lng are non-numeric', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/closest?lat=abc&lng=xyz');
      expect(res.status).toBe(400);
    });

    it('returns 404 when no study locations are configured', async () => {
      const { app } = buildApp({ locations: [] });
      const res = await supertest(app).get('/api/locations/closest?lat=28.6&lng=-81.2');
      expect(res.status).toBe(404);
    });

    it('returns 200 with the closest location', async () => {
      const { app } = buildApp();
      // The single location is at (28.6002, -81.2018) — essentially same coords
      const res = await supertest(app).get('/api/locations/closest?lat=28.6002&lng=-81.2018');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('studyLocationId');
    });

    it('accepts alternative lat/lng query aliases (latitude, longitude)', async () => {
      const { app } = buildApp();
      const res = await supertest(app)
        .get('/api/locations/closest?latitude=28.6002&longitude=-81.2018');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /api/locations/:locationId ───────────────────────────
  describe('GET /api/locations/:locationId', () => {
    it('returns 404 when the location does not exist', async () => {
      const { app, StudyLocationModel } = buildApp();
      StudyLocationModel.findOne.mockReturnValue(makeFindQuery(null));

      const res = await supertest(app).get('/api/locations/nonexistent-id');
      expect(res.status).toBe(404);
    });

    it('returns 200 with location data and locationGroup when found', async () => {
      const { app } = buildApp();
      const res = await supertest(app).get('/api/locations/loc-1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('studyLocationId');
      expect(res.body).toHaveProperty('locationGroup');
    });
  });
});
