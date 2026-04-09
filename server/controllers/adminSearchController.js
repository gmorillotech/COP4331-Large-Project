const adminSearchService = require("../services/adminSearchService");
const { searchLocations } = require("../services/locationSearchService");

function createAdminSearchController({
  locationSearchService = { searchLocations },
  reportAdminService = adminSearchService,
} = {}) {
  return {
    async search(req, res) {
      try {
        const results = await locationSearchService.searchLocations(req.query);
        return res.status(200).json(results);
      } catch (error) {
        return res.status(500).json({ error: "Server error during search.", details: error.message });
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
        return res.status(500).json({ error: "Server error fetching reports.", details: error.message });
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
        return res.status(500).json({ error: "Server error deleting report.", details: error.message });
      }
    },
  };
}

module.exports = createAdminSearchController();
module.exports.createAdminSearchController = createAdminSearchController;
