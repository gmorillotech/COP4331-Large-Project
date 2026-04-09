const crypto = require("crypto");
const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const AuditLog = require("../models/AuditLog");
const {
  isClosedPolygon,
  validatePolygon,
  polygonsTouchOrOverlap,
  unionPolygons,
} = require("../services/geometryValidation");

/**
 * Load closed polygon rings from all groups whose locationGroupId is NOT
 * in the given exclusion list. Used by both shape-update and merge endpoints.
 */
async function loadOtherGroupPolygons(excludeIds) {
  const filter = Array.isArray(excludeIds) && excludeIds.length === 1
    ? { locationGroupId: { $ne: excludeIds[0] }, shapeType: "polygon" }
    : { locationGroupId: { $nin: excludeIds }, shapeType: "polygon" };

  const otherGroups = await LocationGroup.find(filter);

  return otherGroups
    .filter((g) => Array.isArray(g.polygon) && g.polygon.length >= 3)
    .map((g) => {
      const { vertices } = isClosedPolygon(
        g.polygon.map((v) => ({ latitude: v.latitude, longitude: v.longitude })),
      );
      return vertices;
    });
}

function extractChildPoints(locations) {
  return locations.map((loc) => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
  }));
}

function computeCentroid(points) {
  const lat = points.reduce((s, p) => s + p.latitude, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.longitude, 0) / points.length;
  return { latitude: lat, longitude: lng };
}

function averageFinite(values) {
  const finite = values.filter((v) => v != null && Number.isFinite(v));
  return finite.length > 0
    ? finite.reduce((sum, v) => sum + v, 0) / finite.length
    : null;
}

function approximateCirclePolygon(group, segments = 48) {
  if (
    !Number.isFinite(group.centerLatitude) ||
    !Number.isFinite(group.centerLongitude) ||
    !Number.isFinite(group.radiusMeters) ||
    group.radiusMeters <= 0
  ) {
    return null;
  }

  const vertices = [];
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng =
    111_320 * Math.cos((group.centerLatitude * Math.PI) / 180);

  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    vertices.push({
      latitude: group.centerLatitude + (Math.cos(theta) * group.radiusMeters) / metersPerDegreeLat,
      longitude: group.centerLongitude + (Math.sin(theta) * group.radiusMeters) / metersPerDegreeLng,
    });
  }

  return isClosedPolygon(vertices).vertices;
}

function groupShapeToPolygon(group) {
  if (group.shapeType === "polygon" && Array.isArray(group.polygon) && group.polygon.length >= 3) {
    return isClosedPolygon(
      group.polygon.map((vertex) => ({
        latitude: vertex.latitude,
        longitude: vertex.longitude,
      })),
    ).vertices;
  }

  return approximateCirclePolygon(group);
}

function polygonCentroid(vertices) {
  const openVertices = vertices.slice(0, -1);
  return computeCentroid(openVertices);
}

// --- Route handlers ---

async function updateGroupShape(req, res) {
  try {
    const { groupId } = req.params;
    const { shapeType, polygon } = req.body;

    if (shapeType !== "polygon") {
      return res.status(400).json({ errors: ["shapeType must be 'polygon'."] });
    }

    if (!Array.isArray(polygon) || polygon.length === 0) {
      return res.status(400).json({ errors: ["polygon must be a non-empty array of vertices."] });
    }

    const [group, childLocations, otherPolygons] = await Promise.all([
      LocationGroup.findOne({ locationGroupId: groupId }),
      StudyLocation.find({ locationGroupId: groupId }),
      loadOtherGroupPolygons([groupId]),
    ]);

    if (!group) {
      return res.status(404).json({ error: "Location group not found." });
    }

    const childPoints = extractChildPoints(childLocations);
    const validation = validatePolygon(polygon, otherPolygons, childPoints);
    if (!validation.valid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const beforeSnapshot = {
      shapeType: group.shapeType,
      polygon: group.polygon,
      shapeUpdatedAt: group.shapeUpdatedAt,
    };

    const { vertices: closedPolygon } = isClosedPolygon(polygon);

    group.shapeType = "polygon";
    group.polygon = closedPolygon;
    group.shapeUpdatedAt = new Date();
    await group.save();

    await AuditLog.create({
      auditId: crypto.randomUUID(),
      adminUserId: req.user.userId,
      actionType: "group_redraw",
      targetType: "location_group",
      targetId: groupId,
      beforeSnapshot,
      afterSnapshot: {
        shapeType: group.shapeType,
        polygon: group.polygon,
        shapeUpdatedAt: group.shapeUpdatedAt,
      },
    });

    return res.status(200).json({ message: "Shape updated", group });
  } catch (error) {
    console.error("Error updating group shape:", error);
    return res.status(500).json({ error: "Server error updating group shape." });
  }
}

async function mergeGroups(req, res) {
  try {
    const { sourceGroupIds, destinationName } = req.body;

    if (!Array.isArray(sourceGroupIds) || sourceGroupIds.length !== 2) {
      return res.status(400).json({ error: "Exactly 2 source group IDs are required." });
    }

    if (sourceGroupIds[0] === sourceGroupIds[1]) {
      return res.status(400).json({ error: "Source group IDs must be distinct." });
    }

    if (!destinationName || typeof destinationName !== "string" || destinationName.trim() === "") {
      return res.status(400).json({ error: "destinationName must be a non-empty string." });
    }

    const [sourceGroups, childLocations] = await Promise.all([
      LocationGroup.find({ locationGroupId: { $in: sourceGroupIds } }),
      StudyLocation.find({ locationGroupId: { $in: sourceGroupIds } }),
    ]);

    if (sourceGroups.length !== 2) {
      return res.status(404).json({ error: "One or both source groups not found." });
    }

    const sourcePolygons = sourceGroups.map(groupShapeToPolygon);
    if (sourcePolygons.some((polygon) => !polygon || polygon.length < 4)) {
      return res.status(400).json({
        error: "Both groups must have valid saved boundaries before they can be merged.",
      });
    }

    if (!polygonsTouchOrOverlap(sourcePolygons[0], sourcePolygons[1])) {
      return res.status(400).json({
        error: "Groups can only be merged if their boundaries overlap or share a border.",
      });
    }

    const mergedPolygon = unionPolygons(sourcePolygons[0], sourcePolygons[1]);
    if (!mergedPolygon || mergedPolygon.length < 4) {
      return res.status(400).json({
        error: "Could not compute a valid merged boundary from the selected groups.",
      });
    }

    const childPoints = extractChildPoints(childLocations);
    const otherPolygons = await loadOtherGroupPolygons(sourceGroupIds);
    const validation = validatePolygon(mergedPolygon, otherPolygons, childPoints);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.errors.join(" "),
      });
    }

    const newGroupId = crypto.randomUUID();

    await StudyLocation.updateMany(
      { locationGroupId: { $in: sourceGroupIds } },
      { locationGroupId: newGroupId },
    );

    const avgNoise = averageFinite(childLocations.map((loc) => loc.currentNoiseLevel));
    const avgOccupancy = averageFinite(childLocations.map((loc) => loc.currentOccupancyLevel));
    const centroid = polygonCentroid(mergedPolygon);

    const destinationGroup = await LocationGroup.create({
      locationGroupId: newGroupId,
      name: destinationName.trim(),
      shapeType: "polygon",
      polygon: mergedPolygon,
      shapeUpdatedAt: new Date(),
      centerLatitude: centroid.latitude,
      centerLongitude: centroid.longitude,
      radiusMeters: null,
      currentNoiseLevel: avgNoise,
      currentOccupancyLevel: avgOccupancy,
      updatedAt: new Date(),
    });

    await LocationGroup.deleteMany({
      locationGroupId: { $in: sourceGroupIds },
    });

    await AuditLog.create({
      auditId: crypto.randomUUID(),
      adminUserId: req.user.userId,
      actionType: "group_merge",
      targetType: "location_group",
      targetId: newGroupId,
      beforeSnapshot: sourceGroups.map((g) => g.toObject()),
      afterSnapshot: destinationGroup.toObject(),
    });

    return res.status(200).json({
      message: "Groups merged",
      destinationGroup,
      newGroupId,
      requiresRedraw: false,
      deletedGroupIds: sourceGroupIds,
    });
  } catch (error) {
    console.error("Error merging groups:", error);
    return res.status(500).json({ error: "Server error merging location groups." });
  }
}

module.exports = {
  updateGroupShape,
  mergeGroups,
};
