const express = require("express");
const { createOrder, verifyPayment,cancelOrderOnPaymentfailed } = require("../controllers/payment.controller");
const { cancelOrder } = require("../controllers/orderCancel.controller");

const router = express.Router();


router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);
router.post("/cancel-order", cancelOrder);
router.post("/cancel-order-onpaymentfailed", cancelOrderOnPaymentfailed);
module.exports = router;

