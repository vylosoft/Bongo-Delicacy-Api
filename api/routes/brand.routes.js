const express = require("express");
const router = express.Router();

const {
  addBrand,
  getAllBrands,
  getBrandDetails,
  updateBrand,
  uploadBrandImage
} = require("../controllers/brand.controller");

const multer = require("multer");
const upload = multer();

router.post("/", addBrand);
router.get("/", getAllBrands);
router.get("/:id", getBrandDetails);
router.put("/:id", updateBrand);
router.post("/upload-image", upload.single("file"), uploadBrandImage);

module.exports = router;