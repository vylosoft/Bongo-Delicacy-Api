const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  uploadDeliveryPoints,
  getDeliveryPoints
} = require("../controllers/deliveryPoints.controller");

// memory storage (like your image upload)
const upload = multer();

router.post("/upload", upload.single("file"), uploadDeliveryPoints);
router.get("/", getDeliveryPoints);

module.exports = router;