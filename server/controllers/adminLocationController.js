const crypto = require("crypto");
const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const AuditLog = require("../models/AuditLog");
const {
  isClosedPolygon,
  validatePolygon,
  computeConvexHull,
  bufferPolygon,
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

    const newGroupId = crypto.randomUUID();

    await StudyLocation.updateMany(
      { locationGroupId: { $in: sourceGroupIds } },
      { locationGroupId: newGroupId },
    );

    const avgNoise = averageFinite(childLocations.map((loc) => loc.currentNoiseLevel));
    const avgOccupancy = averageFinite(childLocations.map((loc) => loc.currentOccupancyLevel));

    const childPoints = extractChildPoints(childLocations);

    let finalShapeType = "circle";
    let finalPolygon = [];
    let requiresRedraw = false;
    let centerLatitude = null;
    let centerLongitude = null;
    let radiusMeters = null;

    if (childPoints.length >= 3) {
      const hull = computeConvexHull(childPoints);
      const bufferedHull = bufferPolygon(hull, 20);
      const { vertices: closedHull } = isClosedPolygon(bufferedHull);

      const otherPolygons = await loadOtherGroupPolygons(sourceGroupIds);
      const validation = validatePolygon(closedHull, otherPolygons, childPoints);

      if (validation.valid) {
        finalShapeType = "polygon";
        finalPolygon = closedHull;
      } else {
        requiresRedraw = true;
      }
    } else {
      requiresRedraw = true;
    }

    if (childPoints.length > 0) {
      const centroid = computeCentroid(childPoints);
      centerLatitude = centroid.latitude;
      centerLongitude = centroid.longitude;
    }

    // Fall back to circle: compute radius from centroid
    if (finalShapeType === "circle") {
      if (childPoints.length > 0) {
        let maxDist = 0;
        for (const p of childPoints) {
          const d = haversineDistanceMeters(
            { latitude: centerLatitude, longitude: centerLongitude },
            p,
          );
          if (d > maxDist) maxDist = d;
        }
        radiusMeters = Math.max(60, maxDist + 45);
      } else {
        const srcLats = sourceGroups.map((g) => g.centerLatitude).filter((v) => v != null);
        const srcLngs = sourceGroups.map((g) => g.centerLongitude).filter((v) => v != null);

        centerLatitude = srcLats.length > 0
          ? srcLats.reduce((a, b) => a + b, 0) / srcLats.length
          : 0;
        centerLongitude = srcLngs.length > 0
          ? srcLngs.reduce((a, b) => a + b, 0) / srcLngs.length
          : 0;
        radiusMeters = 60;
      }
    }

    const destinationGroup = await LocationGroup.create({
      locationGroupId: newGroupId,
      name: destinationName.trim(),
      shapeType: finalShapeType,
      polygon: finalPolygon,
      shapeUpdatedAt: finalShapeType === "polygon" ? new Date() : null,
      centerLatitude,
      centerLongitude,
      radiusMeters: finalShapeType === "polygon" ? null : radiusMeters,
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
      requiresRedraw,
      deletedGroupIds: sourceGroupIds,
    });
  } catch (error) {
    console.error("Error merging groups:", error);
    return res.status(500).json({ error: "Server error merging location groups." });
  }
}

function haversineDistanceMeters(a, b) {
  const earthRadiusMeters = 6_371_000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const aLat = toRad(a.latitude);
  const bLat = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

module.exports = {
  updateGroupShape,
  mergeGroups,
};
