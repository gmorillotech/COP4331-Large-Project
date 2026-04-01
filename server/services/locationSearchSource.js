const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const { locationGroups, studyLocations } = require("./locationCatalog");

async function loadSearchSource({
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
} = {}) {
  try {
    let [locationDocs, groupDocs] = await Promise.all([
      StudyLocationModel.find().lean(),
      LocationGroupModel.find().lean(),
    ]);

    if (locationDocs.length === 0 && groupDocs.length === 0) {
      await Promise.all([
        LocationGroupModel.bulkWrite(
          locationGroups.map((group) => ({
            updateOne: {
              filter: { locationGroupId: group.locationGroupId },
              update: {
                $setOnInsert: {
                  locationGroupId: group.locationGroupId,
                  name: group.name,
                  currentNoiseLevel: null,
                  currentOccupancyLevel: null,
                  updatedAt: null,
                },
              },
              upsert: true,
            },
          })),
        ),
        StudyLocationModel.bulkWrite(
          studyLocations.map((location) => ({
            updateOne: {
              filter: { studyLocationId: location.studyLocationId },
              update: {
                $setOnInsert: {
                  studyLocationId: location.studyLocationId,
                  locationGroupId: location.locationGroupId,
                  name: location.name,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  currentNoiseLevel: null,
                  currentOccupancyLevel: null,
                  updatedAt: null,
                },
              },
              upsert: true,
            },
          })),
        ),
      ]);

      [locationDocs, groupDocs] = await Promise.all([
        StudyLocationModel.find().lean(),
        LocationGroupModel.find().lean(),
      ]);
    }

    if (locationDocs.length > 0 || groupDocs.length > 0) {
      return {
        locations: locationDocs,
        groups: groupDocs,
        source: "database",
      };
    }
  } catch (_error) {
    // Fall through to catalog-backed data.
  }

  return {
    locations: studyLocations.map((location) => ({
      studyLocationId: location.studyLocationId,
      locationGroupId: location.locationGroupId,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    })),
    groups: locationGroups.map((group) => ({
      locationGroupId: group.locationGroupId,
      name: group.name,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    })),
    source: "catalog",
  };
}

module.exports = {
  loadSearchSource,
};
