const express = require("express");
const router = express.Router();
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

const outletController = require("../controllers/outlet.controller");

// ==========================
// ✅ NORMAL APIs
// ==========================
router.get("/", outletController.getAll);
router.get("/getbylocation", outletController.getByLocation);

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