const express = require("express");
const router = express.Router();

const {
  getAll,
  getDetails,
  addDeliveryCharge,
  update,
  remove,
 getDeliveryCharge 
} = require("../controllers/deliveryCharge.controller");

router.get("/", getAll);
router.get("/:id", getDetails);
router.post("/", addDeliveryCharge);
router.put("/:id", update);
router.delete("/:id", remove);
router.post(
  "/delivery-charge",
  getDeliveryCharge
);
module.exports = router;