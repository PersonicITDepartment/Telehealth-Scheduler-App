const express = require('express');
const router = express.Router();
// const {  generateReport, getRecentReports } = require('../controllers/export.controller');
// const { generateSummaryReport } = require('../controllers/reportSummary');
const { generateProviderSummaryReport, getRecentReports, getUtilizationChartData, generateStateSummaryReport } = require('../controllers/reportSummary.controller');
const { protect } = require('../middlewares/auth');

// Export schedule to Excel
// POST /api/schedule/export?startDate=2025-09-29&endDate=2025-10-01
// router.get('/export', exportDoctorScheduleToExcel);

// router.post("/generate", generateReport);
router.post("/download",protect, generateProviderSummaryReport);
router.post("/download/state",protect, generateStateSummaryReport);
router.post("/generate",protect, getUtilizationChartData);
router.get("/most-recent",protect, getRecentReports);

module.exports = router;