const router = require("express").Router();
const riderController = require("../controllers/rider.controller.js");
const riderWebhookController = require("../controllers/riderWebhookController.js");
router.post("/service-availability", riderController.serviceAvailability);
router.post("/rider-booking", riderController.riderBooking);
router.post("/rider-cancel", riderController.riderCancel);
router.post("/rider-details", riderController.riderDetails);
router.post("/rider-webhook", riderWebhookController.riderWebhookController);
module.exports = router;
