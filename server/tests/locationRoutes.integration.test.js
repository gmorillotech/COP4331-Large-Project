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

it("GET /api/locations/search bootstraps catalog data into an empty connected database", async () => {
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
    assert.ok(body.results.length > 0);
    assert.ok(StudyLocationModel.records.length > 0);
    assert.ok(LocationGroupModel.records.length > 0);
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
