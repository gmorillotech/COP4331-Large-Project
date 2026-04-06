const adminSearchService = require("../services/adminSearchService");

const search = async (req, res) => {
  try {
    const { q } = req.query;
    const results = await adminSearchService.searchLocations(q);
    return res.status(200).json(results);
  } catch (error) {
    return res.status(500).json({ error: "Server error during search.", details: error.message });
  }
};

const getActiveReports = async (req, res) => {
  try {
    const { groupId, locationId, q, page, limit } = req.query;
    const results = await adminSearchService.getActiveReports({
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
};

const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const result = await adminSearchService.deleteReport(reportId, req.user.userId);

    if (!result) {
      return res.status(404).json({ error: "Report not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: "Server error deleting report.", details: error.message });
  }
};

module.exports = { search, getActiveReports, deleteReport };
