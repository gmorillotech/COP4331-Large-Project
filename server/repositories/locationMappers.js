function toStudyLocation(document) {
  return {
    studyLocationId: document.studyLocationId,
    locationGroupId: document.locationGroupId,
    name: document.name,
    floorLabel: document.floorLabel ?? "",
    sublocationLabel: document.sublocationLabel ?? "",
    description: document.description ?? "",
    latitude: document.latitude,
    longitude: document.longitude,
    currentNoiseLevel: document.currentNoiseLevel,
    currentOccupancyLevel: document.currentOccupancyLevel,
    updatedAt: document.updatedAt ? new Date(document.updatedAt) : null,
  };
}

function toLocationGroup(document) {
  return {
    locationGroupId: document.locationGroupId,
    name: document.name,
    centerLatitude: document.centerLatitude ?? null,
    centerLongitude: document.centerLongitude ?? null,
    radiusMeters: document.radiusMeters ?? null,
    shapeType: document.shapeType ?? "circle",
    polygon: document.polygon ?? [],
    shapeUpdatedAt: document.shapeUpdatedAt ?? null,
    currentNoiseLevel: document.currentNoiseLevel,
    currentOccupancyLevel: document.currentOccupancyLevel,
    updatedAt: document.updatedAt ? new Date(document.updatedAt) : null,
  };
}

module.exports = {
  toStudyLocation,
  toLocationGroup,
};
