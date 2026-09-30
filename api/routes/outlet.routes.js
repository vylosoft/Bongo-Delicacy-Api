const express = require("express");
const router = express.Router();
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

const outletController = require("../controllers/outlet.controller");
const outletTimingsController = require("../controllers/outlet_timings.controller");

// ==========================
// ✅ NORMAL APIs
// ==========================
router.get("/", outletController.getAll);
router.get("/getbylocation", outletController.getByLocation);

// ==========================
// ✅ TIMINGS APIs
// ==========================
router.get("/:outlet_id/timings/status", outletTimingsController.getCurrentStatus);
router.get("/:outlet_id/timings", outletTimingsController.getTimings);
router.post("/:outlet_id/timings", outletTimingsController.saveTimings);
router.patch("/:outlet_id/timings/toggle-day", outletTimingsController.toggleDay);
router.post("/:outlet_id/timings/copy-to-all", outletTimingsController.copyToAllDays);

// ==========================
// ✅ NEW (ADD THIS)
// ==========================
router.get("/brand/:brand_id", outletController.getBrandOutletByLocation);

// ==========================
// ⚠️ KEEP THIS LAST
// ==========================
router.get("/:uuid", outletController.getDetails);

router.post("/upload-image", upload.single("file"), outletController.uploadOutletImage);
router.put("/:id", outletController.update);

module.exports = router;