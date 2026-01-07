const router = require("express").Router();
const riderController = require("../controllers/rider.controller.js");

router.post("/service-availability", riderController.serviceAvailability);
router.post("/rider-booking", riderController.riderBooking);
router.post("/rider-cancel", riderController.riderCancel);
router.post("/rider-details", riderController.riderDetails);

module.exports = router;
