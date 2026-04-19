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

  // Just remove the report + its metadata. DO NOT touch StudyLocation or
  // LocationGroup aggregates here — that used to recompute with a naive
  // mean (sum/count) that bypassed A1's weighted-decay formula AND
  // instantly nulled the card with `updatedAt: new Date()` when the
  // deleted report was the last one, defeating the freshness-window
  // preservation fix. The next A1 polling cycle will recompute the
  // aggregates correctly with the proper decay/trust-weighted math, or
  // (if no live reports remain) fall through the freshness-preservation
  // branch so the UI card keeps the last known values until the window
  // elapses.
  await Promise.all([
    ReportTagMetadata.deleteOne({ reportId }),
    Report.deleteOne({ reportId }),
  ]);

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
