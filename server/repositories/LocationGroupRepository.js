const LocationGroup = require("../models/LocationGroup");
const { toLocationGroup } = require("./locationMappers");
const { resolveQuery } = require("./queryHelpers");

class LocationGroupRepository {
  constructor(LocationGroupModel = LocationGroup) {
    this.LocationGroupModel = LocationGroupModel;
  }

  async getAllLocationGroups() {
    const groups = await resolveQuery(this.LocationGroupModel.find());
    return groups.map(toLocationGroup);
  }

  async getLocationGroupById(locationGroupId) {
    const group = await resolveQuery(this.LocationGroupModel.findOne({ locationGroupId }));
    return group ? toLocationGroup(group) : null;
  }

  async updateLocationGroup(group) {
    const updated = await resolveQuery(this.LocationGroupModel.findOneAndUpdate(
      { locationGroupId: group.locationGroupId },
      {
        $set: {
          locationGroupId: group.locationGroupId,
          name: group.name,
          centerLatitude: group.centerLatitude ?? null,
          centerLongitude: group.centerLongitude ?? null,
          radiusMeters: group.radiusMeters ?? null,
          currentNoiseLevel: group.currentNoiseLevel,
          currentOccupancyLevel: group.currentOccupancyLevel,
          updatedAt: group.updatedAt,
        },
      },
      { new: true, upsert: true },
    ));

    return toLocationGroup(updated);
  }

  async bulkUpdateLocationGroups(groups) {
    if (groups.length === 0) {
      return;
    }

    await Promise.all(groups.map((group) => this.updateLocationGroup(group)));
  }
}

module.exports = {
  LocationGroupRepository,
};
