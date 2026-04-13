const StudyLocation = require("../models/StudyLocation");
const { toStudyLocation } = require("./locationMappers");
const { resolveQuery } = require("./queryHelpers");

class StudyLocationRepository {
  constructor(StudyLocationModel = StudyLocation) {
    this.StudyLocationModel = StudyLocationModel;
  }

  async getAllStudyLocations() {
    const locations = await resolveQuery(this.StudyLocationModel.find());
    return locations.map(toStudyLocation);
  }

  async getStudyLocationById(studyLocationId) {
    const location = await resolveQuery(this.StudyLocationModel.findOne({ studyLocationId }));
    return location ? toStudyLocation(location) : null;
  }

  async createStudyLocation(location) {
    const created = await resolveQuery(this.StudyLocationModel.findOneAndUpdate(
      { studyLocationId: location.studyLocationId },
      {
        $set: {
          studyLocationId: location.studyLocationId,
          locationGroupId: location.locationGroupId,
          name: location.name,
          floorLabel: location.floorLabel ?? "",
          sublocationLabel: location.sublocationLabel ?? "",
          latitude: location.latitude,
          longitude: location.longitude,
          currentNoiseLevel: location.currentNoiseLevel ?? null,
          currentOccupancyLevel: location.currentOccupancyLevel ?? null,
          updatedAt: location.updatedAt ?? null,
        },
      },
      { returnDocument: 'after', upsert: true },
    ));
    return created ? toStudyLocation(created) : null;
  }

  async updateStudyLocation(location) {
    const updated = await resolveQuery(this.StudyLocationModel.findOneAndUpdate(
      { studyLocationId: location.studyLocationId },
      {
        $set: {
          studyLocationId: location.studyLocationId,
          locationGroupId: location.locationGroupId,
          name: location.name,
          floorLabel: location.floorLabel ?? "",
          sublocationLabel: location.sublocationLabel ?? "",
          latitude: location.latitude,
          longitude: location.longitude,
          currentNoiseLevel: location.currentNoiseLevel,
          currentOccupancyLevel: location.currentOccupancyLevel,
          updatedAt: location.updatedAt,
        },
      },
      { new: true },
    ));

    return updated ? toStudyLocation(updated) : null;
  }

  async bulkUpdateStudyLocations(locations) {
    if (locations.length === 0) {
      return;
    }

    await Promise.all(locations.map((location) => this.updateStudyLocation(location)));
  }
}

module.exports = {
  StudyLocationRepository,
};
