const router = require("express").Router();

const {
  addBrandOutlet,
  getOutletsByBrand,
  getAllBrandOutlets,
  removeBrandOutlet
} = require("../controllers/brandOutlet.controller");

router.post("/", addBrandOutlet);
router.get("/", getAllBrandOutlets);
router.get("/:brand_id", getOutletsByBrand);
router.delete("/:id", removeBrandOutlet);

module.exports = router;
