const crypto = require("crypto");
const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");
const {
  isClosedPolygon,
  validatePolygon,
  polygonsTouchOrOverlap,
  polygonsHaveAreaOverlap,
  polygonsShareBorder,
  minDistanceBetweenPolygons,
  snapVerticesToNeighborEdges,
  unionPolygons,
  findAdjacentMergeCandidate,
  validateSplitGeometry,
} = require("../services/geometryValidation");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

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

function formatMeters(meters) {
  if (!Number.isFinite(meters)) return "an unknown distance";
  if (meters < 0.5) return "less than half a meter";
  if (meters < 10) return `about ${meters.toFixed(1)} meters`;
  return `about ${Math.round(meters)} meters`;
}

/**
 * Produce a specific diagnostic for why two polygons can't be merged. The
 * generic "boundaries overlap, share a border, or …" message isn't actionable,
 * so we distinguish the common failure modes an admin can fix:
 *   - polygons only touch at a point (need a second snapped vertex)
 *   - polygons are too far apart (> maxGapMeters)
 *   - polygons are near each other but another group sits between them
 */
function describeMergeFailure(polyA, polyB, maxGapMeters) {
  const haveAreaOverlap = polygonsHaveAreaOverlap(polyA, polyB);
  const shareBorder = polygonsShareBorder(polyA, polyB);

  if (haveAreaOverlap || shareBorder) {
    return "Groups share geometry but a clean merged polygon could not be produced. Adjust one of the boundaries and try again.";
  }

  const gap = minDistanceBetweenPolygons(polyA, polyB);

  if (gap < 0.5) {
    return "Groups touch at only a single point. Drag a second consecutive boundary vertex onto the same neighboring edge to create a shared border, then try merging again.";
  }

  if (gap > maxGapMeters) {
    return `Groups are ${formatMeters(gap)} apart (max allowed: ${maxGapMeters} meters). Redraw the boundaries so they meet or sit within the allowed gap.`;
  }

  return `Groups are ${formatMeters(gap)} apart but another group lies between them, so no clean merge corridor exists.`;
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
    const normalizedPolygon = snapVerticesToNeighborEdges(
      polygon,
      otherPolygons,
      SERVER_RUNTIME_CONFIG.admin.groupBoundaryNormalizeToleranceMeters,
    );
    const validation = validatePolygon(normalizedPolygon, otherPolygons, childPoints);
    if (!validation.valid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const beforeSnapshot = {
      shapeType: group.shapeType,
      polygon: group.polygon,
      shapeUpdatedAt: group.shapeUpdatedAt,
    };

    const { vertices: closedPolygon } = isClosedPolygon(normalizedPolygon);

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

    const rawSourcePolygons = sourceGroups.map(groupShapeToPolygon);
    if (rawSourcePolygons.some((polygon) => !polygon || polygon.length < 4)) {
      return res.status(400).json({
        error: "Both groups must have valid saved boundaries before they can be merged.",
      });
    }

    const maxGapMeters =
      SERVER_RUNTIME_CONFIG.admin.groupMergeAdjacencyMaxGapMeters;
    const normalizeToleranceMeters =
      SERVER_RUNTIME_CONFIG.admin.groupBoundaryNormalizeToleranceMeters;
    const otherPolygons = await loadOtherGroupPolygons(sourceGroupIds);

    // Normalize each source polygon against the other so tiny float-drift
    // from admin-side snapping doesn't block unionPolygons. Tolerance is
    // sub-meter, so this can't hide a real gap.
    const sourcePolygons = [
      isClosedPolygon(
        snapVerticesToNeighborEdges(
          rawSourcePolygons[0],
          [rawSourcePolygons[1]],
          normalizeToleranceMeters,
        ),
      ).vertices,
      isClosedPolygon(
        snapVerticesToNeighborEdges(
          rawSourcePolygons[1],
          [rawSourcePolygons[0]],
          normalizeToleranceMeters,
        ),
      ).vertices,
    ];

    let mergedPolygon = null;
    if (polygonsTouchOrOverlap(sourcePolygons[0], sourcePolygons[1])) {
      mergedPolygon = unionPolygons(sourcePolygons[0], sourcePolygons[1]);
    } else {
      const candidate = findAdjacentMergeCandidate(
        sourcePolygons[0],
        sourcePolygons[1],
        otherPolygons,
        maxGapMeters,
      );
      if (candidate) {
        mergedPolygon = candidate.mergedPolygon;
      }
    }

    if (!mergedPolygon || mergedPolygon.length < 4) {
      const failureMessage = describeMergeFailure(
        sourcePolygons[0],
        sourcePolygons[1],
        maxGapMeters,
      );
      console.error("[mergeGroups] union/merge failed", {
        sourceGroupIds,
        polyA: sourcePolygons[0],
        polyB: sourcePolygons[1],
        message: failureMessage,
      });
      return res.status(400).json({ error: failureMessage });
    }

    const childPoints = extractChildPoints(childLocations);
    const validation = validatePolygon(mergedPolygon, otherPolygons, childPoints);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.errors.join(" "),
      });
    }

    // Reject up front if the destination name conflicts with a group that
    // isn't one of the sources being merged. A collision with a source name
    // is allowed because those sources are about to be deleted.
    const trimmedDestinationName = destinationName.trim();
    const nameCollision = await LocationGroup.findOne({
      name: trimmedDestinationName,
      locationGroupId: { $nin: sourceGroupIds },
    });
    if (nameCollision) {
      return res.status(400).json({
        error: `A group named "${trimmedDestinationName}" already exists. Choose a different name.`,
      });
    }

    const newGroupId = crypto.randomUUID();

    await StudyLocation.updateMany(
      { locationGroupId: { $in: sourceGroupIds } },
      { locationGroupId: newGroupId },
    );

    // Delete the source groups BEFORE creating the destination so the
    // admin can reuse one of the source group names — the unique `name`
    // index would otherwise reject the insert.
    await LocationGroup.deleteMany({
      locationGroupId: { $in: sourceGroupIds },
    });

    const avgNoise = averageFinite(childLocations.map((loc) => loc.currentNoiseLevel));
    const avgOccupancy = averageFinite(childLocations.map((loc) => loc.currentOccupancyLevel));
    const centroid = polygonCentroid(mergedPolygon);

    const destinationGroup = await LocationGroup.create({
      locationGroupId: newGroupId,
      name: trimmedDestinationName,
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

async function splitGroup(req, res) {
  try {
    const { groupId } = req.params;
    const { parentPolygon, splitLine, destinationGroups } = req.body;

    // Input validation
    if (!Array.isArray(parentPolygon) || parentPolygon.length < 3) {
      return res.status(400).json({ error: "parentPolygon must be an array of at least 3 vertices." });
    }
    if (!Array.isArray(splitLine) || splitLine.length < 2) {
      return res.status(400).json({ error: "splitLine must be an array of at least 2 points." });
    }
    if (!Array.isArray(destinationGroups) || destinationGroups.length !== 2) {
      return res.status(400).json({ error: "destinationGroups must be an array of exactly 2 objects." });
    }

    const nameA = destinationGroups[0]?.name;
    const nameB = destinationGroups[1]?.name;
    if (!nameA || typeof nameA !== "string" || nameA.trim() === "") {
      return res.status(400).json({ error: "destinationGroups[0].name must be a non-empty string." });
    }
    if (!nameB || typeof nameB !== "string" || nameB.trim() === "") {
      return res.status(400).json({ error: "destinationGroups[1].name must be a non-empty string." });
    }

    // Load data in parallel
    const [group, childLocations, otherPolygons] = await Promise.all([
      LocationGroup.findOne({ locationGroupId: groupId }),
      StudyLocation.find({ locationGroupId: groupId }),
      loadOtherGroupPolygons([groupId]),
    ]);

    if (!group) {
      return res.status(404).json({ error: "Location group not found." });
    }

    // Normalize the parent polygon against neighbor edges so tiny drift from
    // admin-side snapping doesn't cause validation or downstream merge issues.
    const normalizedParentPolygon = snapVerticesToNeighborEdges(
      parentPolygon,
      otherPolygons,
      SERVER_RUNTIME_CONFIG.admin.groupBoundaryNormalizeToleranceMeters,
    );

    // Geometry validation
    const childPoints = extractChildPoints(childLocations);
    const validation = validateSplitGeometry(normalizedParentPolygon, splitLine, otherPolygons, childPoints);
    if (!validation.valid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const { childA, childB, classification } = validation;

    // Create new groups
    const groupAId = crypto.randomUUID();
    const groupBId = crypto.randomUUID();

    const locsA = classification.groupA.map((idx) => childLocations[idx]);
    const locsB = classification.groupB.map((idx) => childLocations[idx]);

    const centroidA = childA.length >= 4 ? polygonCentroid(childA) : computeCentroid(extractChildPoints(locsA));
    const centroidB = childB.length >= 4 ? polygonCentroid(childB) : computeCentroid(extractChildPoints(locsB));

    const avgNoiseA = averageFinite(locsA.map((l) => l.currentNoiseLevel));
    const avgOccupancyA = averageFinite(locsA.map((l) => l.currentOccupancyLevel));
    const avgNoiseB = averageFinite(locsB.map((l) => l.currentNoiseLevel));
    const avgOccupancyB = averageFinite(locsB.map((l) => l.currentOccupancyLevel));

    // Reassign locations
    const reassignOps = [];
    if (locsA.length > 0) {
      reassignOps.push(
        StudyLocation.updateMany(
          { studyLocationId: { $in: locsA.map((l) => l.studyLocationId) } },
          { locationGroupId: groupAId },
        ),
      );
    }
    if (locsB.length > 0) {
      reassignOps.push(
        StudyLocation.updateMany(
          { studyLocationId: { $in: locsB.map((l) => l.studyLocationId) } },
          { locationGroupId: groupBId },
        ),
      );
    }
    await Promise.all(reassignOps);

    const now = new Date();

    const [groupA, groupB] = await Promise.all([
      LocationGroup.create({
        locationGroupId: groupAId,
        name: nameA.trim(),
        shapeType: "polygon",
        polygon: childA,
        shapeUpdatedAt: now,
        centerLatitude: centroidA.latitude,
        centerLongitude: centroidA.longitude,
        radiusMeters: null,
        currentNoiseLevel: avgNoiseA,
        currentOccupancyLevel: avgOccupancyA,
        updatedAt: now,
      }),
      LocationGroup.create({
        locationGroupId: groupBId,
        name: nameB.trim(),
        shapeType: "polygon",
        polygon: childB,
        shapeUpdatedAt: now,
        centerLatitude: centroidB.latitude,
        centerLongitude: centroidB.longitude,
        radiusMeters: null,
        currentNoiseLevel: avgNoiseB,
        currentOccupancyLevel: avgOccupancyB,
        updatedAt: now,
      }),
    ]);

    // Delete parent group and create audit log
    await Promise.all([
      LocationGroup.deleteOne({ locationGroupId: groupId }),
      AuditLog.create({
        auditId: crypto.randomUUID(),
        adminUserId: req.user.userId,
        actionType: "group_split",
        targetType: "location_group",
        targetId: groupId,
        beforeSnapshot: group.toObject(),
        afterSnapshot: {
          groupA: groupA.toObject(),
          groupB: groupB.toObject(),
          classification: {
            groupA: classification.groupA.length,
            groupB: classification.groupB.length,
          },
        },
      }),
    ]);

    return res.status(200).json({
      message: "Group split",
      groupA,
      groupB,
      deletedGroupId: groupId,
    });
  } catch (error) {
    console.error("Error splitting group:", error);
    return res.status(500).json({ error: "Server error splitting location group." });
  }
}

/**
 * Cascade-delete a location group along with its StudyLocations and all
 * Reports associated with those StudyLocations. Child data is irrecoverably
 * removed because StudyLocation.locationGroupId is required — orphaning
 * would need a schema change.
 */
async function deleteGroup(req, res) {
  try {
    const { groupId } = req.params;
    if (typeof groupId !== "string" || groupId.trim() === "") {
      return res.status(400).json({ error: "groupId is required." });
    }

    const group = await LocationGroup.findOne({ locationGroupId: groupId });
    if (!group) {
      return res.status(404).json({ error: "Location group not found." });
    }

    const childLocations = await StudyLocation.find({ locationGroupId: groupId });
    const studyLocationIds = childLocations.map((l) => l.studyLocationId);

    const reportDeleteResult = studyLocationIds.length > 0
      ? await Report.deleteMany({ studyLocationId: { $in: studyLocationIds } })
      : { deletedCount: 0 };

    const locationDeleteResult = studyLocationIds.length > 0
      ? await StudyLocation.deleteMany({ studyLocationId: { $in: studyLocationIds } })
      : { deletedCount: 0 };

    await LocationGroup.deleteOne({ locationGroupId: groupId });

    await AuditLog.create({
      auditId: crypto.randomUUID(),
      adminUserId: req.user.userId,
      actionType: "group_delete",
      targetType: "location_group",
      targetId: groupId,
      beforeSnapshot: {
        group: group.toObject(),
        childLocations: childLocations.map((l) => l.toObject()),
      },
      afterSnapshot: null,
    });

    return res.status(200).json({
      message: "Group deleted",
      deletedGroupId: groupId,
      deletedLocationCount: locationDeleteResult.deletedCount ?? 0,
      deletedReportCount: reportDeleteResult.deletedCount ?? 0,
    });
  } catch (error) {
    console.error("Error deleting group:", error);
    return res.status(500).json({ error: "Server error deleting location group." });
  }
}

module.exports = {
  updateGroupShape,
  mergeGroups,
  splitGroup,
  deleteGroup,
};
