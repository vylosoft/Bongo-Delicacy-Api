const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
// multer memory storage (so we can upload buffer to Supabase)

const outletController = require("../controllers/outlet.controller");

router.get("/", outletController.getAll);

router.get("/:uuid", outletController.getDetails);

router.post("/upload-image", upload.single("file"), outletController.uploadOutletImage);

router.put("/:id", outletController.update);


module.exports = router;
