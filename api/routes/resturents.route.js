const express = require("express");
const router = express.Router();
const multer = require("multer");

// multer memory storage (so we can upload buffer to Supabase)
const upload = multer({ storage: multer.memoryStorage() });

const {
  fetchResturentByMappingId,
  addResturent,
  addResturentTable,
  getTablesByRestaurant,
  toggleTableStatus,
  uploadRestaurantImage, // ✅ import this
} = require("../controllers/returents.controller");

// Fetch restaurant using mappingId
router.get("/restaurant-by-mappingId", fetchResturentByMappingId);

// Add restaurant (DB insert only)
router.post("/add", addResturent);

// Upload image to Supabase storage and return URL
router.post("/upload-image", upload.single("file"), uploadRestaurantImage);

// Add table
router.post("/:rest_id/addTable", addResturentTable);

// Get tables
router.get("/:rest_id/tables", getTablesByRestaurant);

// Toggle table active/inactive
router.patch("/table/:table_id/toggleStatus", toggleTableStatus);

module.exports = router;
