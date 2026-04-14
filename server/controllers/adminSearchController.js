const adminSearchService = require("../services/adminSearchService");
const { ReportProcessingService } = require("../services/reportProcessingService");
const { searchLocations } = require("../services/locationSearchService");

const reportProcessingService = new ReportProcessingService();

function errorBody(message, error) {
  const body = { error: message };
  if (process.env.NODE_ENV !== "production" && error && error.message) {
    body.details = error.message;
  }
  return body;
}

function createAdminSearchController({
  locationSearchService = {
    searchLocations(query) {
      return searchLocations(query, {
        reportProcessingService,
      });
    },
  },
  reportAdminService = adminSearchService,
} = {}) {
  return {
    async search(req, res) {
      try {
        const results = await locationSearchService.searchLocations(req.query);
        return res.status(200).json(results);
      } catch (error) {
        return res.status(500).json(errorBody("Server error during search.", error));
      }
    },

    async getActiveReports(req, res) {
      try {
        const { groupId, locationId, q, page, limit } = req.query;
        const results = await reportAdminService.getActiveReports({
          groupId,
          locationId,
          q,
          page,
          limit,
        });
        return res.status(200).json(results);
      } catch (error) {
        return res.status(500).json(errorBody("Server error fetching reports.", error));
      }
    },

    async deleteReport(req, res) {
      try {
        const { reportId } = req.params;
        const result = await reportAdminService.deleteReport(reportId, req.user.userId);

        if (!result) {
          return res.status(404).json({ error: "Report not found" });
        }

        return res.status(200).json(result);
      } catch (error) {
        return res.status(500).json(errorBody("Server error deleting report.", error));
      }
    },
  };
}

module.exports = createAdminSearchController();
module.exports.createAdminSearchController = createAdminSearchController;
