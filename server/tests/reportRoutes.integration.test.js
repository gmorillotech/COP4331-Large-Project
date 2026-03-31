const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const { createReportRouter } = require("../routes/reportRoutes");

const registeredTests = [];

function it(name, run) {
  registeredTests.push({ name, run });
}

function createFakeReportModel(records) {
  return {
    find(filter = {}) {
      const filtered = records.filter((record) => {
        if (!filter.studyLocationId) {
          return true;
        }

        return record.studyLocationId === filter.studyLocationId;
      });

      return {
        sort(sortSpec) {
          const [[key, direction]] = Object.entries(sortSpec);
          const sorted = [...filtered].sort((left, right) =>
            direction >= 0
              ? left[key] > right[key] ? 1 : -1
              : left[key] < right[key] ? 1 : -1,
          );

          return {
            limit: async (count) => sorted.slice(0, count),
          };
        },
      };
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

it("POST /api/reports returns 201 and forwards the canonical report payload", async () => {
  const calls = [];
  const fakeReportProcessingService = {
    async submitCanonicalReport(payload) {
      calls.push(payload);
      return {
        report: {
          reportId: "report-123",
          ...payload,
        },
        metadata: {
          reportId: "report-123",
          noiseWeightFactor: 0.9,
        },
        studyLocation: {
          studyLocationId: payload.studyLocationId,
        },
        locationGroup: {
          locationGroupId: "group-john-c-hitt-library",
        },
        cycle: {
          activeReportCount: 1,
        },
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/reports",
    createReportRouter({
      optionalProtectMiddleware: (_req, _res, next) => next(),
      protectMiddleware: (_req, _res, next) => next(),
      reportProcessingService: fakeReportProcessingService,
      ReportModel: { find: () => ({ sort: () => ({ limit: async () => [] }) }) },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "local-user",
        studyLocationId: "library-floor-1-quiet",
        createdAt: "2026-03-30T18:30:00.000Z",
        avgNoise: 51,
        maxNoise: 58,
        variance: 5,
        occupancy: 3,
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].studyLocationId, "library-floor-1-quiet");
    assert.equal(calls[0].avgNoise, 51);
    assert.equal(calls[0].maxNoise, 58);
    assert.equal(calls[0].variance, 5);
    assert.equal(calls[0].occupancy, 3);
    assert.ok(calls[0].createdAt instanceof Date);
    assert.equal(body.report.reportId, "report-123");
    assert.equal(body.cycle.activeReportCount, 1);
  });
});

it("POST /api/reports rejects requests missing canonical fields", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/reports",
    createReportRouter({
      optionalProtectMiddleware: (_req, _res, next) => next(),
      protectMiddleware: (_req, _res, next) => next(),
      reportProcessingService: {
        async submitCanonicalReport() {
          throw new Error("should not be called");
        },
      },
      ReportModel: { find: () => ({ sort: () => ({ limit: async () => [] }) }) },
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studyLocationId: "library-floor-1-quiet",
        avgNoise: 51,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Missing canonical report fields/);
  });
});

it("GET /api/reports/recent returns recent reports when authorized", async () => {
  const records = [
    {
      reportId: "report-2",
      studyLocationId: "library-floor-1-quiet",
      createdAt: "2026-03-30T18:32:00.000Z",
      avgNoise: 55,
    },
    {
      reportId: "report-1",
      studyLocationId: "library-floor-2-moderate",
      createdAt: "2026-03-30T18:30:00.000Z",
      avgNoise: 49,
    },
  ];

  const app = express();
  app.use(express.json());
  app.use(
    "/api/reports",
    createReportRouter({
      optionalProtectMiddleware: (_req, _res, next) => next(),
      protectMiddleware: (req, _res, next) => {
        req.user = { userId: "authorized-user" };
        next();
      },
      reportProcessingService: {
        async submitCanonicalReport() {
          throw new Error("not used");
        },
      },
      ReportModel: createFakeReportModel(records),
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/recent`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.length, 2);
    assert.equal(body[0].reportId, "report-2");
    assert.equal(body[1].reportId, "report-1");
  });
});

it("GET /api/reports/location/:locationId returns location reports when authorized", async () => {
  const records = [
    {
      reportId: "report-3",
      studyLocationId: "library-floor-1-quiet",
      createdAt: "2026-03-30T18:34:00.000Z",
      avgNoise: 57,
    },
    {
      reportId: "report-2",
      studyLocationId: "library-floor-1-quiet",
      createdAt: "2026-03-30T18:32:00.000Z",
      avgNoise: 55,
    },
    {
      reportId: "report-1",
      studyLocationId: "library-floor-2-moderate",
      createdAt: "2026-03-30T18:30:00.000Z",
      avgNoise: 49,
    },
  ];

  const app = express();
  app.use(express.json());
  app.use(
    "/api/reports",
    createReportRouter({
      optionalProtectMiddleware: (_req, _res, next) => next(),
      protectMiddleware: (req, _res, next) => {
        req.user = { userId: "authorized-user" };
        next();
      },
      reportProcessingService: {
        async submitCanonicalReport() {
          throw new Error("not used");
        },
      },
      ReportModel: createFakeReportModel(records),
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/location/library-floor-1-quiet`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.length, 2);
    assert.equal(body[0].reportId, "report-3");
    assert.equal(body[1].reportId, "report-2");
    assert.ok(body.every((report) => report.studyLocationId === "library-floor-1-quiet"));
  });
});

it("GET /api/reports/recent returns 401 when authorization fails", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/reports",
    createReportRouter({
      optionalProtectMiddleware: (_req, _res, next) => next(),
      protectMiddleware: (_req, res) => {
        res.status(401).json({ error: "Not authorized, token failed" });
      },
      reportProcessingService: {
        async submitCanonicalReport() {
          throw new Error("not used");
        },
      },
      ReportModel: createFakeReportModel([]),
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/recent`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.match(body.error, /Not authorized/);
  });
});

void run();

async function run() {
  let failures = 0;

  for (const testCase of registeredTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`All ${registeredTests.length} report-route integration tests passed.`);
}
