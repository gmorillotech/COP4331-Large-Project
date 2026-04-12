const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const { createLocationRouter } = require("../routes/locationRoutes");

const registeredTests = [];

function it(name, run) {
  registeredTests.push({ name, run });
}

function createQueryModel(records, { singleKey = null } = {}) {
  return {
    records,
    find(filter = {}) {
      const filtered = records.filter((record) => {
        return Object.entries(filter).every(([key, value]) => record[key] === value);
      });

      return {
        lean: async () => filtered.map((record) => ({ ...record })),
        sort(sortSpec) {
          const [[key, direction]] = Object.entries(sortSpec);
          const sorted = [...filtered].sort((left, right) =>
            direction >= 0
              ? String(left[key]).localeCompare(String(right[key]))
              : String(right[key]).localeCompare(String(left[key])),
          );

          return Promise.resolve(sorted.map((record) => ({ ...record })));
        },
      };
    },
    findOne(filter = {}) {
      const record = records.find((entry) =>
        Object.entries(filter).every(([key, value]) => entry[key] === value),
      );

      if (!record) {
        return Promise.resolve(null);
      }

      return {
        select() {
          return Promise.resolve({
            toObject: () => ({ ...record }),
          });
        },
        toObject() {
          return { ...record };
        },
      };
    },
    async findOneAndUpdate(filter = {}, update = {}, options = {}) {
      const existingIndex = records.findIndex((entry) =>
        Object.entries(filter).every(([key, value]) => entry[key] === value),
      );
      const nextValue = {
        ...(existingIndex >= 0 ? records[existingIndex] : {}),
        ...(update.$set ?? {}),
      };

      if (existingIndex >= 0) {
        records[existingIndex] = nextValue;
      } else if (options.upsert) {
        records.push(nextValue);
      } else {
        return null;
      }

      return { ...nextValue };
    },
    async bulkWrite(operations) {
      for (const operation of operations) {
        const update = operation.updateOne;
        if (!update) {
          continue;
        }

        const existing = records.find((entry) =>
          Object.entries(update.filter).every(([key, value]) => entry[key] === value),
        );

        if (existing) {
          continue;
        }

        records.push({ ...(update.update?.$setOnInsert ?? {}) });
      }
    },
  };
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

it("GET /api/locations/search filters and sorts location results using backend criteria", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 44,
      currentOccupancyLevel: 2,
      updatedAt: new Date("2026-03-31T12:00:00.000Z"),
    },
    {
      studyLocationId: "library-floor-2-moderate",
      locationGroupId: "group-john-c-hitt-library",
      name: "Collaboration Tables",
      latitude: 28.60036,
      longitude: -81.20168,
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: new Date("2026-03-31T12:01:00.000Z"),
    },
    {
      studyLocationId: "student-union-food-court",
      locationGroupId: "group-student-union",
      name: "Food Court Seating",
      latitude: 28.60192,
      longitude: -81.19994,
      currentNoiseLevel: 74,
      currentOccupancyLevel: 5,
      updatedAt: new Date("2026-03-31T12:02:00.000Z"),
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 52,
      currentOccupancyLevel: 3,
      updatedAt: new Date("2026-03-31T12:03:00.000Z"),
    },
    {
      locationGroupId: "group-student-union",
      name: "Student Union",
      currentNoiseLevel: 74,
      currentOccupancyLevel: 5,
      updatedAt: new Date("2026-03-31T12:03:00.000Z"),
    },
  ]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?q=study&includeGroups=false&includeLocations=true&sortBy=noise,distance&minNoise=40&maxNoise=60&maxOccupancy=4&lat=28.6003&lng=-81.2012&maxRadiusMeters=250`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.error, "");
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].id, "library-floor-1-quiet");
    assert.equal(body.results[0].kind, "location");
    assert.ok(body.results[0].distanceMeters >= 0);
    assert.equal(body.source, "database");
  });
});

it("GET /api/locations/search can return grouped building results sorted by distance", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 44,
      currentOccupancyLevel: 2,
      updatedAt: null,
    },
    {
      studyLocationId: "msb-floor-2-moderate",
      locationGroupId: "group-mathematical-sciences-building",
      name: "Study Nook",
      latitude: 28.60116,
      longitude: -81.19886,
      currentNoiseLevel: 56,
      currentOccupancyLevel: 3,
      updatedAt: null,
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 44,
      currentOccupancyLevel: 2,
      updatedAt: null,
    },
    {
      locationGroupId: "group-mathematical-sciences-building",
      name: "Mathematical Sciences Building",
      currentNoiseLevel: 56,
      currentOccupancyLevel: 3,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=true&includeLocations=false&sortBy=distance&lat=28.60025&lng=-81.2018`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 2);
    assert.equal(body.results[0].kind, "group");
    assert.equal(body.results[0].buildingName, "John C. Hitt Library");
    assert.ok(body.results[0].distanceMeters <= body.results[1].distanceMeters);
  });
});

it("GET /api/locations/search prefers fresh live status text over historical baseline", async () => {
  const freshUpdatedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago

  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: freshUpdatedAt,
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: freshUpdatedAt,
    },
  ]);

  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline() {
          return { usualNoise: 44, usualOccupancy: 2 };
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.match(body.results[0].statusText, /^Live estimate:/);
  });
});

it("GET /api/locations/search falls back to historical text when live data is older than the freshness window", async () => {
  const staleUpdatedAt = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago (> 3h)

  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: staleUpdatedAt,
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: staleUpdatedAt,
    },
  ]);

  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline() {
          return { usualNoise: 44, usualOccupancy: 2 };
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].statusText, "Usually quiet at this time");
  });
});

it("GET /api/locations/search returns waiting text when neither fresh live data nor baseline is available", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline() {
          return null;
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].statusText, "Awaiting live reports");
  });
});

it("GET /api/locations/search prefers historical status text when archived baseline exists", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: new Date("2026-03-31T12:00:00.000Z"),
    },
  ]);

  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: new Date("2026-03-31T12:03:00.000Z"),
    },
  ]);

  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline(locationId, at) {
          assert.equal(locationId, "library-floor-1-quiet");
          assert.ok(at instanceof Date);
          return {
            usualNoise: 44,
            usualOccupancy: 2,
          };
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].statusText, "Usually quiet at this time");
  });
});

it("GET /api/locations/search skips historical baseline fetches for locations with fresh live data", async () => {
  const freshUpdatedAt = new Date(Date.now() - 30 * 60 * 1000);

  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "fresh-loc",
      locationGroupId: "group-john-c-hitt-library",
      name: "Fresh Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 50,
      currentOccupancyLevel: 3,
      updatedAt: freshUpdatedAt,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 50,
      currentOccupancyLevel: 3,
      updatedAt: freshUpdatedAt,
    },
  ]);

  const baselineCalls = [];
  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline(locationId) {
          baselineCalls.push(locationId);
          return { usualNoise: 44, usualOccupancy: 2 };
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.deepEqual(baselineCalls, []);
  });
});

it("GET /api/locations/search limits baseline hydration to returned locations", async () => {
  const staleUpdatedAt = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "match-loc",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study Zone",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 58,
      currentOccupancyLevel: 4,
      updatedAt: staleUpdatedAt,
    },
    {
      studyLocationId: "excluded-loc",
      locationGroupId: "group-student-union",
      name: "Food Court Seating",
      latitude: 28.60192,
      longitude: -81.19994,
      currentNoiseLevel: 74,
      currentOccupancyLevel: 5,
      updatedAt: staleUpdatedAt,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      updatedAt: staleUpdatedAt,
    },
    {
      locationGroupId: "group-student-union",
      name: "Student Union",
      updatedAt: staleUpdatedAt,
    },
  ]);

  const baselineCalls = [];
  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline(locationId) {
          baselineCalls.push(locationId);
          return { usualNoise: 44, usualOccupancy: 2 };
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?q=quiet&includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].id, "match-loc");
    assert.deepEqual(baselineCalls, ["match-loc"]);
  });
});

it("GET /api/locations/search restricts results to the viewport bounds when provided", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "in-bounds",
      locationGroupId: "group-a",
      name: "In Bounds",
      latitude: 28.60050,
      longitude: -81.20150,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "out-of-bounds",
      locationGroupId: "group-b",
      name: "Out Of Bounds",
      latitude: 28.70000,
      longitude: -81.10000,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    { locationGroupId: "group-a", name: "Group A", updatedAt: null },
    { locationGroupId: "group-b", name: "Group B", updatedAt: null },
  ]);

  const baselineCalls = [];
  const app = express();
  app.use(
    "/api/locations",
    createLocationRouter({
      StudyLocationModel,
      LocationGroupModel,
      reportProcessingService: {
        async getHistoricalBaseline(locationId) {
          baselineCalls.push(locationId);
          return null;
        },
      },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true&minLat=28.6&minLng=-81.205&maxLat=28.605&maxLng=-81.19`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].id, "in-bounds");
    assert.deepEqual(baselineCalls, ["in-bounds"]);
  });
});

it("GET /api/locations/search returns the full catalog when no bounds or query are provided", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-1",
      locationGroupId: "group-a",
      name: "Alpha",
      latitude: 28.60010,
      longitude: -81.20100,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-2",
      locationGroupId: "group-b",
      name: "Beta",
      latitude: 28.60020,
      longitude: -81.20200,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    { locationGroupId: "group-a", name: "Group A", updatedAt: null },
    { locationGroupId: "group-b", name: "Group B", updatedAt: null },
  ]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/locations/search?includeGroups=false&includeLocations=true`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    const returnedIds = body.results.map((entry) => entry.id).sort();
    assert.deepEqual(returnedIds, ["loc-1", "loc-2"]);
  });
});

it("GET /api/locations/search returns empty results when both collections are empty (no catalog seeding)", async () => {
  const StudyLocationModel = createQueryModel([]);
  const LocationGroupModel = createQueryModel([]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/search?includeGroups=true&includeLocations=true`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.error, "");
    assert.equal(body.source, "database");
    assert.equal(body.results.length, 0);
    assert.equal(StudyLocationModel.records.length, 0);
    assert.equal(LocationGroupModel.records.length, 0);
  });
});

it("GET /api/locations/groups returns location groups sorted by name", async () => {
  const StudyLocationModel = createQueryModel([]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-b",
      name: "Student Union",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      locationGroupId: "group-a",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body[0].name, "John C. Hitt Library");
    assert.equal(body[1].name, "Student Union");
  });
});

it("POST /api/locations/groups creates a new hexagonal group when the user is outside existing groups", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Wing",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Chemistry Building",
        centerLatitude: 28.60230,
        centerLongitude: -81.19780,
        creatorLatitude: 28.60225,
        creatorLongitude: -81.19778,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.name, "Chemistry Building");
    assert.equal(body.shapeType, "polygon");
    assert.equal(body.radiusMeters, 60);
    assert.equal(body.polygon.length, 7);
    assert.deepEqual(body.polygon[0], body.polygon[body.polygon.length - 1]);
    assert.ok(body.locationGroupId.startsWith("group-chemistry-building"));
  });
});

it("POST /api/locations/groups rejects creation when the user is already inside an existing group", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Wing",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Duplicate Library",
        centerLatitude: 28.60020,
        centerLongitude: -81.20185,
        creatorLatitude: 28.60025,
        creatorLongitude: -81.20180,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /inside an existing location group/i);
  });
});

it("GET /api/locations/groups/:groupId/locations returns group locations sorted by name", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-b",
      locationGroupId: "group-1",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Collaboration Tables",
      latitude: 28.60036,
      longitude: -81.20168,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups/group-1/locations`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body[0].name, "Collaboration Tables");
    assert.equal(body[1].name, "Quiet Study");
  });
});

it("POST /api/locations/groups/:groupId/locations creates a new study location within the group boundary", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-b",
      locationGroupId: "group-1",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Wing",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Collaboration Tables",
      floorLabel: "Floor 2",
      sublocationLabel: "West Commons",
      latitude: 28.60036,
      longitude: -81.20168,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups/group-1/locations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Window Carrels",
        floorLabel: "Floor 2",
        sublocationLabel: "East Windows",
        latitude: 28.60030,
        longitude: -81.20174,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.locationGroupId, "group-1");
    assert.equal(body.name, "Window Carrels");
    assert.equal(body.floorLabel, "Floor 2");
    assert.equal(body.sublocationLabel, "East Windows");
    assert.equal(StudyLocationModel.records.length, 3);
  });
});

it("POST /api/locations/groups/:groupId/locations accepts omitted floor and description fields", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-b",
      locationGroupId: "group-1",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Wing",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Collaboration Tables",
      floorLabel: "Floor 2",
      sublocationLabel: "West Commons",
      latitude: 28.60036,
      longitude: -81.20168,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups/group-1/locations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Window Carrels",
        latitude: 28.60030,
        longitude: -81.20174,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.locationGroupId, "group-1");
    assert.equal(body.name, "Window Carrels");
    assert.equal(body.floorLabel, "");
    assert.equal(body.sublocationLabel, "");
    assert.equal(StudyLocationModel.records.length, 3);
  });
});

it("POST /api/locations/groups/:groupId/locations honors a saved polygon over stale circle data", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Existing Study Nook",
      floorLabel: "Floor 2",
      sublocationLabel: "Atrium",
      latitude: 28.60110,
      longitude: -81.19886,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "Mathematical Sciences Building",
      shapeType: "polygon",
      polygon: [
        { latitude: 28.60090, longitude: -81.19910 },
        { latitude: 28.60134, longitude: -81.19910 },
        { latitude: 28.60134, longitude: -81.19858 },
        { latitude: 28.60090, longitude: -81.19858 },
      ],
      centerLatitude: 28.61000,
      centerLongitude: -81.19000,
      radiusMeters: 10,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups/group-1/locations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Polygon Interior Desk",
        floorLabel: "Floor 2",
        sublocationLabel: "West Hall",
        latitude: 28.60102,
        longitude: -81.19882,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.locationGroupId, "group-1");
    assert.equal(body.name, "Polygon Interior Desk");
  });
});

it("POST /api/locations/groups/:groupId/locations rejects coordinates outside the group boundary", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-b",
      locationGroupId: "group-1",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Wing",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Collaboration Tables",
      floorLabel: "Floor 2",
      sublocationLabel: "West Commons",
      latitude: 28.60036,
      longitude: -81.20168,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-1",
      name: "John C. Hitt Library",
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/groups/group-1/locations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Too Far Away",
        floorLabel: "Floor 9",
        sublocationLabel: "Nowhere",
        latitude: 28.61024,
        longitude: -81.19182,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /boundary/i);
    assert.equal(StudyLocationModel.records.length, 2);
  });
});

it("GET /api/locations/:locationId returns the location plus its parent group", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: 44,
      currentOccupancyLevel: 2,
      updatedAt: new Date("2026-03-31T12:00:00.000Z"),
    },
  ]);
  const LocationGroupModel = createQueryModel([
    {
      locationGroupId: "group-john-c-hitt-library",
      name: "John C. Hitt Library",
      currentNoiseLevel: 52,
      currentOccupancyLevel: 3,
      updatedAt: new Date("2026-03-31T12:03:00.000Z"),
    },
  ]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/library-floor-1-quiet`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.studyLocationId, "library-floor-1-quiet");
    assert.equal(body.locationGroup.locationGroupId, "group-john-c-hitt-library");
    assert.equal(body.locationGroup.name, "John C. Hitt Library");
  });
});

it("GET /api/locations/closest returns the nearest study location", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "loc-a",
      locationGroupId: "group-1",
      name: "Quiet Study",
      latitude: 28.60024,
      longitude: -81.20182,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
    {
      studyLocationId: "loc-b",
      locationGroupId: "group-1",
      name: "Collaboration Tables",
      latitude: 28.60124,
      longitude: -81.19982,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    },
  ]);
  const LocationGroupModel = createQueryModel([]);

  const app = express();
  app.use("/api/locations", createLocationRouter({ StudyLocationModel, LocationGroupModel }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/locations/closest?lat=28.6002&lng=-81.2018`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.studyLocationId, "loc-a");
  });
});

async function run() {
  for (const test of registeredTests) {
    await test.run();
  }

  console.log(`All ${registeredTests.length} location-route integration tests passed.`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
