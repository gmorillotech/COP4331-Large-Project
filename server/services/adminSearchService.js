const crypto = require("crypto");

const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const Report = require("../models/Report");
const ReportTagMetadata = require("../models/ReportTagMetadata");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

const REPORT_STALE_MINUTES = SERVER_RUNTIME_CONFIG.display.reportStaleMinutes;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getActiveReports({
  groupId,
  locationId,
  q,
  page = 1,
  limit = SERVER_RUNTIME_CONFIG.admin.activeReportsDefaultPageSize,
}) {
  const {
    activeReportsDefaultPageSize: defaultPageSize,
    activeReportsMaxPageSize: maxPageSize,
  } = SERVER_RUNTIME_CONFIG.admin;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(maxPageSize, Number(limit) || defaultPageSize));
  const skip = (safePage - 1) * safeLimit;

  const staleCutoff = new Date(Date.now() - REPORT_STALE_MINUTES * 60 * 1000);

  const filter = {
    reportKind: "live",
    createdAt: { $gte: staleCutoff },
  };

  if (locationId) {
    filter.studyLocationId = locationId;
  } else if (groupId) {
    const locations = await StudyLocation.find({ locationGroupId: groupId })
      .select("studyLocationId")
      .lean();
    const locationIds = locations.map((loc) => loc.studyLocationId);
    filter.studyLocationId = { $in: locationIds };
  }

  if (q && q.trim()) {
    const searchRegex = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [
      { userId: searchRegex },
      { studyLocationId: searchRegex },
    ];
  }

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Report.countDocuments(filter),
  ]);

  if (reports.length === 0) {
    return { reports: [], total, page: safePage, limit: safeLimit };
  }

  const locationIds = [...new Set(reports.map((r) => r.studyLocationId))];
  const userIds = [...new Set(reports.map((r) => r.userId).filter(Boolean))];

  const [locations, users] = await Promise.all([
    StudyLocation.find({ studyLocationId: { $in: locationIds } })
      .select("studyLocationId name")
      .lean(),
    userIds.length > 0
      ? User.find({ userId: { $in: userIds } })
          .select("userId displayName login")
          .lean()
      : [],
  ]);

  const locationMap = new Map(locations.map((loc) => [loc.studyLocationId, loc.name]));
  const userMap = new Map(
    users.map((u) => [u.userId, u.displayName || u.login]),
  );

  const enrichedReports = reports.map((report) => ({
    reportId: report.reportId,
    studyLocationId: report.studyLocationId,
    userId: report.userId,
    createdAt: report.createdAt,
    avgNoise: report.avgNoise,
    maxNoise: report.maxNoise,
    variance: report.variance,
    occupancy: report.occupancy,
    locationName: locationMap.get(report.studyLocationId) || null,
    reporterDisplayName: userMap.get(report.userId) || null,
  }));

  return { reports: enrichedReports, total, page: safePage, limit: safeLimit };
}

async function deleteReport(reportId, adminUserId) {
  const report = await Report.findOne({ reportId }).lean();
  if (!report) {
    return null;
  }

  const studyLocationId = report.studyLocationId;

  await Promise.all([
    ReportTagMetadata.deleteOne({ reportId }),
    Report.deleteOne({ reportId }),
  ]);

  const staleCutoff = new Date(Date.now() - REPORT_STALE_MINUTES * 60 * 1000);
  const remainingReports = await Report.find({
    studyLocationId,
    reportKind: "live",
    createdAt: { $gte: staleCutoff },
  }).lean();

  let newNoise = null;
  let newOccupancy = null;

  if (remainingReports.length > 0) {
    const noiseSum = remainingReports.reduce((sum, r) => sum + r.avgNoise, 0);
    const occupancySum = remainingReports.reduce((sum, r) => sum + r.occupancy, 0);
    newNoise = noiseSum / remainingReports.length;
    newOccupancy = occupancySum / remainingReports.length;
  }

  const location = await StudyLocation.findOneAndUpdate(
    { studyLocationId },
    {
      $set: {
        currentNoiseLevel: newNoise,
        currentOccupancyLevel: newOccupancy,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();

  if (location) {
    const siblingLocations = await StudyLocation.find({
      locationGroupId: location.locationGroupId,
    }).lean();

    const locationsWithData = siblingLocations.filter(
      (loc) => loc.currentNoiseLevel != null && loc.currentOccupancyLevel != null,
    );

    let groupNoise = null;
    let groupOccupancy = null;

    if (locationsWithData.length > 0) {
      const groupNoiseSum = locationsWithData.reduce(
        (sum, loc) => sum + loc.currentNoiseLevel,
        0,
      );
      const groupOccupancySum = locationsWithData.reduce(
        (sum, loc) => sum + loc.currentOccupancyLevel,
        0,
      );
      groupNoise = groupNoiseSum / locationsWithData.length;
      groupOccupancy = groupOccupancySum / locationsWithData.length;
    }

    await LocationGroup.findOneAndUpdate(
      { locationGroupId: location.locationGroupId },
      {
        $set: {
          currentNoiseLevel: groupNoise,
          currentOccupancyLevel: groupOccupancy,
          updatedAt: new Date(),
        },
      },
    );
  }

  await new AuditLog({
    auditId: crypto.randomUUID(),
    adminUserId,
    actionType: "report_delete",
    targetType: "report",
    targetId: reportId,
    beforeSnapshot: report,
    afterSnapshot: null,
  }).save();

  return { message: "Report deleted", reportId };
}

module.exports = { getActiveReports, deleteReport };
