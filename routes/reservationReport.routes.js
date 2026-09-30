const express = require("express");
const {
	getReservationCapacitySummary,
	getProviderReservationChartData,
	getStateReservationChartData,
	getDoctorReservationsByState,
} = require("../controllers/reservationReport.controller");
const { protect } = require("../middlewares/auth");

const router = express.Router();

router.post("/summary", protect, getReservationCapacitySummary);
router.post("/chart/providers", protect, getProviderReservationChartData);
router.post("/chart/states", protect, getStateReservationChartData);
router.post("/table/doctors-by-state", protect, getDoctorReservationsByState);

module.exports = router;