const express = require("express");
const router = express.Router();

const {
  addBrand,
  getAllBrands,
  getBrandDetails,
  updateBrand,
  uploadBrandImage,
  getBrandsWithOutlet
} = require("../controllers/brand.controller");

const multer = require("multer");
const upload = multer();

// ==========================
// ✅ CREATE
// ==========================
router.post("/", addBrand);

// ==========================
// ✅ SPECIAL ROUTES FIRST
// ==========================
router.get("/with-outlets", getBrandsWithOutlet);  // 🔥 MUST BE BEFORE :id

// ==========================
// ✅ NORMAL ROUTES
// ==========================
router.get("/", getAllBrands);
router.get("/:id", getBrandDetails);
router.put("/:id", updateBrand);

router.post("/upload-image", upload.single("file"), uploadBrandImage);

module.exports = router;