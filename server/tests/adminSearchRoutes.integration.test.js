const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const { createAdminSearchController } = require("../controllers/adminSearchController");
const { createAdminSearchRouter } = require("../routes/adminSearchRoutes");
const { searchLocations } = require("../services/locationSearchService");

const registeredTests = [];

function it(name, run) {
  registeredTests.push({ name, run });
}

function createQueryModel(records) {
  return {
    records,
    find(filter = {}) {
      const filtered = records.filter((record) =>
        Object.entries(filter).every(([key, value]) => {
          if (value && typeof value === "object" && Array.isArray(value.$in)) {
            return value.$in.includes(record[key]);
          }

          return record[key] === value;
        }),
      );

      return {
        lean: async () => filtered.map((record) => ({ ...record })),
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

        if (!existing) {
          records.push({ ...(update.update?.$setOnInsert ?? {}) });
        }
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

it("GET /api/admin/search returns the shared location-search payload for admins", async () => {
  const StudyLocationModel = createQueryModel([
    {
      studyLocationId: "library-floor-1-quiet",
      locationGroupId: "group-john-c-hitt-library",
      name: "Quiet Study",
      floorLabel: "Floor 1",
      sublocationLabel: "North Reading Room",
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
      currentNoiseLevel: 44,
      currentOccupancyLevel: 2,
      updatedAt: new Date("2026-03-31T12:03:00.000Z"),
    },
  ]);

  const controller = createAdminSearchController({
    locationSearchService: {
      searchLocations(query) {
        return searchLocations(query, { StudyLocationModel, LocationGroupModel });
      },
    },
    reportAdminService: {
      async getActiveReports() {
        throw new Error("not used in this test");
      },
      async deleteReport() {
        throw new Error("not used in this test");
      },
    },
  });

  const app = express();
  app.use(
    "/api/admin",
    createAdminSearchRouter({
      protectMiddleware: (req, _res, next) => {
        req.user = { userId: "admin-1", isAdmin: true };
        next();
      },
      requireAdminMiddleware: (_req, _res, next) => next(),
      controller,
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/admin/search?q=library&includeGroups=true&includeLocations=true&sortBy=relevance`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.error, "");
    assert.equal(body.source, "database");
    assert.equal(body.results.length, 2);
    assert.deepEqual(
      body.results.map((item) => item.kind),
      ["group", "location"],
    );
    assert.equal(body.results[0].title, "John C. Hitt Library");
    assert.equal(body.results[1].title, "Quiet Study");
  });
});

async function run() {
  for (const test of registeredTests) {
    await test.run();
  }

  console.log(`All ${registeredTests.length} admin-search integration tests passed.`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
