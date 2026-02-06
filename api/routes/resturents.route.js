const express = require("express");
const router = express.Router();
const multer = require("multer");

// multer memory storage (so we can upload buffer to Supabase)
const upload = multer({ storage: multer.memoryStorage() });
const {
  resolveRestaurant,
} = require("../controllers/restaurantResolver.controller");

const resturentController = require("../controllers/returents.controller");

router.get("/", resturentController.getAll);

router.get("/:uuid", resturentController.getDetails);

// Get tables
router.get("/:rest_id/tables", resturentController.getTablesByRestaurant);


// Fetch restaurant using mappingId
router.get("/restaurant-by-mappingId", resturentController.fetchResturentByMappingId);

// Add restaurant (DB insert only)
router.put("/:id", resturentController.update);

// Upload image to Supabase storage and return URL
router.post("/upload-image", upload.single("file"), resturentController.uploadRestaurantImage);

// Add table
router.post("/addTable", resturentController.addResturentTable);

// Toggle table active/inactive
router.patch("/table/:table_id/toggleStatus", resturentController.toggleTableStatus);
// Resolve nearest open outlet by restaurant name + location
router.post("/resolve-by-name", resolveRestaurant);

module.exports = router;
