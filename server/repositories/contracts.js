/**
 * Repository method map aligned to current service usage.
 * Keep these contracts narrow so persistence implementations only expose what
 * the application layer actually depends on today.
 */

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
    a1Service: ["recalculateLocationStatus", "updateGroupStatus", "pruneExpiredReports"],
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
  repositoryContracts,
};
