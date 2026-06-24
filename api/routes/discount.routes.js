const express = require("express");
const router = express.Router();
const {
  addDiscount,
  editDiscount,
  getAllDiscounts,
  applyDiscount,
  claimDiscount,
  deleteDiscount
} = require("../controllers/discount.controller");

router.get("/", getAllDiscounts);
router.post("/", addDiscount);
router.put("/:uuid", editDiscount);
router.delete("/:uuid", deleteDiscount);   // ✅ NEW
router.post("/apply", applyDiscount);
router.post("/claim", claimDiscount);

module.exports = router;