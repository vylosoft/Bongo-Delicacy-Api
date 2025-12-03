const router = require("express").Router();
const petpujaController = require("../controllers/petpuja.controller");

router.post("/callback", petpujaController.updateOrderStatus);

module.exports = router;
