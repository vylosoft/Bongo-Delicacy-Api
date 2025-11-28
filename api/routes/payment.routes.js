const express = require("express");
const { createOrder, handlePaymentResponse } = require("../controllers/payment.controller");

const router = express.Router();

router.post("/create-order", createOrder);
router.post("/payment-status", handlePaymentResponse);

module.exports = router;
