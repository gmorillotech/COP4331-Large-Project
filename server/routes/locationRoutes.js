const express = require("express");

const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");

const router = express.Router();

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(aLat, aLng, bLat, bLng) {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const startLat = toRadians(aLat);
  const endLat = toRadians(bLat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

router.get("/groups", async (_req, res) => {
  try {
    const groups = await LocationGroup.find().sort({ name: 1 });
    return res.status(200).json(groups);
  } catch (_error) {
    return res.status(500).json({ error: "Server error fetching location groups." });
  }
});

router.get("/groups/:groupId/locations", async (req, res) => {
  try {
    const locations = await StudyLocation.find({ locationGroupId: req.params.groupId }).sort({ name: 1 });
    return res.status(200).json(locations);
  } catch (_error) {
    return res.status(500).json({ error: "Server error fetching study locations." });
  }
});

router.get("/closest", async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "Latitude and longitude query parameters are required." });
    }

    const locations = await StudyLocation.find().lean();
    const closest = locations
      .map((location) => ({
        ...location,
        distanceMeters: distanceInMeters(
          latitude,
          longitude,
          location.latitude,
          location.longitude,
        ),
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .slice(0, 10);

    return res.status(200).json(closest);
  } catch (_error) {
    return res.status(500).json({ error: "Server error finding closest locations." });
  }
});

router.get("/:locationId", async (req, res) => {
  try {
    const location = await StudyLocation.findOne({ studyLocationId: req.params.locationId });
    if (!location) {
      return res.status(404).json({ error: "Location not found." });
    }

    const group = await LocationGroup.findOne({ locationGroupId: location.locationGroupId }).select(
      "locationGroupId name",
    );

    return res.status(200).json({
      ...location.toObject(),
      locationGroup: group ? group.toObject() : null,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Server error fetching location details." });
  }
});

module.exports = router;
