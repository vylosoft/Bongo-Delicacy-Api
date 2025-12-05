// payment.controller.js

const Razorpay = require("razorpay");
const env = require("../../config/env.js");
const crypto = require("crypto");

const { saveOrderSchema } = require("../validations/order.validation.js");
const { placeOrderWithPetpuja, cancelPetpujaOrder } = require("../helpers/petpujaHelper.js");
const { generateOrderId } = require("../../utils/generateOrderId.js");

const { createClient } = require("@supabase/supabase-js");

// Hardcoded because you asked
const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY"
);

/* -------------------------------------------------------
   CREATE ORDER
------------------------------------------------------- */
const createOrder = async (req, res) => {
  const { error, value } = saveOrderSchema(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(e => e.message),
    });
  }

  const data = value.orderinfo.OrderInfo;
  const orderDetails = data.Order.details;
  const restaurantDetails = data.Restaurant.details;

  const clientorderID = generateOrderId();
  orderDetails.clientorderID = clientorderID;

  // 1) PetPooja order
  try {
    await placeOrderWithPetpuja(req.body.orderinfo);
  } catch (err) {
    return res.status(502).json({
      success: false,
      message: "Restaurant did not accept the order",
      error: err.message,
    });
  }

  try {
    // 2) Razorpay order
    const total = Number(orderDetails.total);
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const rpOrder = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
      notes: { clientorderID, restID: restaurantDetails.restID },
    });

    // 3) Save to Supabase
    await supabase.from("orders").insert([
      {
        clientorderid: clientorderID,
        restaurantid: restaurantDetails.restID,
        razorpay_order_id: rpOrder.id,
        amount: total,
        status: "received",
      },
    ]);

    return res.json({
      success: true,
      message: "Order created",
      clientorderID,
      razorpayOrder: rpOrder,
    });
  } catch (err) {
    await cancelPetpujaOrder({
      restID: restaurantDetails.restID,
      clientorderID,
      cancelReason: "Payment initiation failed",
    });

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------------------------------------------
   VERIFY PAYMENT
------------------------------------------------------- */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      clientorderID,
    } = req.body;

    const secret = env.RAZORPAY_KEY_SECRET;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    await supabase
      .from("orders")
      .update({ status: "paid", razorpay_payment_id })
      .eq("clientorderid", clientorderID);

    return res.json({ success: true, message: "Payment verified" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* -------------------------------------------------------
   EXPORTS
------------------------------------------------------- */
module.exports = {
  createOrder,
  verifyPayment,
};
