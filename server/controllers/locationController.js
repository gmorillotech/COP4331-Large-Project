class LocationController {
  constructor(locationService) {
    this.locationService = locationService;
  }

  async getAllGroups(_req, res) {
    try {
      const groups = await this.locationService.getAllGroups();
      return res.status(200).json(groups);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching location groups." });
    }
  }

  async getLocationByGroup(req, res) {
    try {
      const locations = await this.locationService.listLocationsByGroup(req.params.groupId);
      return res.status(200).json(locations);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching study locations." });
    }
  }

  async getLocationById(req, res) {
    try {
      const location = await this.locationService.getLocationById(req.params.locationId);
      const group = await this.locationService.getLocationGroup(req.params.locationId);

      return res.status(200).json({
        ...location,
        locationGroup: group
          ? {
              locationGroupId: group.locationGroupId,
              name: group.name,
            }
          : null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return res.status(404).json({ error: "Location not found." });
      }

      return res.status(500).json({ error: "Server error fetching location details." });
    }
  }

  async getClosestLocation(req, res) {
    const latitude = Number(req.query.latitude ?? req.query.lat);
    const longitude = Number(req.query.longitude ?? req.query.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "Latitude and longitude query parameters are required." });
    }

    try {
      const location = await this.locationService.getClosestLocation({
        latitude,
        longitude,
      });

      return res.status(200).json(location);
    } catch (error) {
      if (isNotFoundError(error)) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: "Server error finding closest locations." });
    }
  }
}

function isNotFoundError(error) {
  return Boolean(
    error &&
      typeof error.message === "string" &&
      (error.message.includes("not found") ||
        error.message.includes("No study location") ||
        error.message.includes("No study locations")),
  );
}

module.exports = {
  LocationController,
};
