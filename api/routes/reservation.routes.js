const express = require("express");
const router = express.Router();
const { createReservation, getAvailableTables } = require("../controllers/reservation.controller");

// Create reservation
router.post("/:rest_id", createReservation);

// Get available tables
router.get("/tables/:rest_id", getAvailableTables);

module.exports = router;
