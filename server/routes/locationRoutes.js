const express = require("express");

const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const { LocationController } = require("../controllers/locationController");
const { LocationGroupRepository } = require("../repositories/LocationGroupRepository");
const { StudyLocationRepository } = require("../repositories/StudyLocationRepository");
const { LocationService } = require("../services/locationService");
const { ReportProcessingService } = require("../services/reportProcessingService");
const { searchLocations } = require("../services/locationSearchService");

function createLocationRouter({
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
  reportProcessingService = null,
} = {}) {
  const router = express.Router();
  const studyLocationRepository = new StudyLocationRepository(StudyLocationModel);
  const locationGroupRepository = new LocationGroupRepository(LocationGroupModel);
  const locationService = new LocationService(
    studyLocationRepository,
    locationGroupRepository,
    Number.POSITIVE_INFINITY,
  );
  const locationController = new LocationController(locationService);

  router.get("/groups", locationController.getAllGroups.bind(locationController));

  router.post("/groups", locationController.createGroup.bind(locationController));

  router.get("/groups/:groupId/locations", locationController.getLocationByGroup.bind(locationController));

  router.post("/groups/:groupId/locations", locationController.createLocationInGroup.bind(locationController));

  router.get("/search", async (req, res) => {
    try {
      const results = await searchLocations(req.query, {
        StudyLocationModel,
        LocationGroupModel,
        reportProcessingService,
      });
      return res.status(200).json(results);
    } catch (_error) {
      return res.status(500).json({ error: "Server error searching locations." });
    }
  });

  router.get("/closest", locationController.getClosestLocation.bind(locationController));

  router.get("/:locationId", locationController.getLocationById.bind(locationController));

  return router;
}

module.exports = createLocationRouter({
  reportProcessingService: new ReportProcessingService(),
});
module.exports.createLocationRouter = createLocationRouter;
