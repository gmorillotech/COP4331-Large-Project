/**
 * Canonical application contracts aligned to the current service layer and the
 * updated class diagram. This file is intentionally narrower than the raw
 * Mongoose schemas so repository implementations expose only the fields and
 * methods the services actually depend on today.
 */

const canonicalModelShapes = {
  User: {
    userId: "string",
    login: "string",
    email: "string",
    firstName: "string | null",
    lastName: "string | null",
    displayName: "string | null",
    hideLocation: "boolean",
    pinColor: "string",
    favorites: "string[]",
    userNoiseWF: "number",
    userOccupancyWF: "number",
    passwordHash: "string",
    role: "user | admin",
    accountStatus: "active | forced_reset | suspended",
    emailVerificationCode: "string | null",
    emailVerificationExpiresAt: "Date | null",
    emailVerifiedAt: "Date | null",
    passwordResetCode: "string | null",
    passwordResetCodeExpiresAt: "Date | null",
    passwordChangedAt: "Date",
    createdAt: "Date",
    updatedAt: "Date",
  },
  Report: {
    reportId: "string",
    userId: "string | null",
    studyLocationId: "string",
    createdAt: "Date",
    avgNoise: "number",
    maxNoise: "number | null",
    variance: "number | null",
    occupancy: "number",
    reportKind: "live | archive_summary",
    windowStart: "Date | null",
    windowEnd: "Date | null",
    updatedAt: "Date",
  },
  ReportTagMetadata: {
    reportId: "string",
    decayFactor: "number",
    varianceCorrectionWF: "number",
    sessionCorrectionNoiseWF: "number",
    noiseWeightFactor: "number",
    occupancyWeightFactor: "number",
    lastEvaluatedAt: "Date",
  },
  StudyLocation: {
    studyLocationId: "string",
    locationGroupId: "string",
    name: "string",
    floorLabel: "string",
    sublocationLabel: "string",
    latitude: "number",
    longitude: "number",
    currentNoiseLevel: "number | null",
    currentOccupancyLevel: "number | null",
    updatedAt: "Date | null",
  },
  LocationGroup: {
    locationGroupId: "string",
    name: "string",
    centerLatitude: "number | null",
    centerLongitude: "number | null",
    radiusMeters: "number | null",
    currentNoiseLevel: "number | null",
    currentOccupancyLevel: "number | null",
    updatedAt: "Date | null",
  },
};

const legacyFieldAlignment = {
  StudyLocation: {
    mongoId: "studyLocationId",
    coordinates: ["longitude", "latitude"],
    currNoiseLevel: "currentNoiseLevel",
    currOccupancyLevel: "currentOccupancyLevel",
  },
  LocationGroup: {
    mongoId: "locationGroupId",
    coordinates: "not part of the canonical service contract",
    currNoiseLevel: "currentNoiseLevel",
    currOccupancyLevel: "currentOccupancyLevel",
  },
  User: {
    note: "Canonical auth field is passwordHash. Verification and password reset now use expiring six-digit codes instead of token links.",
  },
};

const repositoryContracts = {
  AuthService: {
    userRepository: [
      "createUser",
      "authenticate",
      "verifyEmail",
      "generateResetToken",
      "resetPassword",
    ],
  },
  SessionService: {
    userRepository: ["findUserById"],
  },
  LocationService: {
    studyLocationRepository: ["getAllStudyLocations", "getStudyLocationById"],
    locationGroupRepository: ["getAllLocationGroups", "getLocationGroupById"],
  },
  ReportService: {
    reportRepository: ["createReport"],
    a1Service: [
      "initializeMetadataForNewReport",
      "recalculateLocationStatus",
      "updateGroupStatus",
      "pruneExpiredReports",
    ],
  },
  ReportController: {
    reportRepository: ["getReportsByLocation", "getRecentReports"],
  },
  A1Service: {
    reportRepository: [
      "getReportsByLocation",
      "getAllReportsWithMetadata",
      "upsertReportMetadata",
      "deleteReports",
    ],
    userRepository: ["findUsersByIds", "updateUser"],
    studyLocationRepository: [
      "getAllStudyLocations",
      "getStudyLocationById",
      "updateStudyLocation",
      "bulkUpdateStudyLocations",
    ],
    locationGroupRepository: [
      "getAllLocationGroups",
      "getLocationGroupById",
      "updateLocationGroup",
      "bulkUpdateLocationGroups",
    ],
  },
};

module.exports = {
  canonicalModelShapes,
  legacyFieldAlignment,
  repositoryContracts,
};
