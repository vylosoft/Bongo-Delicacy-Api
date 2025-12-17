const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");

const { saveOrderSchema } = require("../validations/order.validation.js");
const {
  placeOrderWithPetpuja,
  cancelPetpujaOrder
} = require("../helpers/petpujaHelper.js");
const { generateOrderId } = require("../../utils/generateOrderId.js");
const { fetchUserPreferences } = require("../helpers/serPreferencesHelper.js");
const { generateOrderDescription } = require("../services/gemini.orderEnhancer.js");
const { createClient } = require('@supabase/supabase-js');
// const supabase = require("../../config/db");
const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------------------------------------
   CREATE ORDER
------------------------------------------------------- */
const createOrder = async (req, res) => {
  const { error, value } = saveOrderSchema(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map(e => e.message),
    });
  }

  const { orderinfo, userId } = value;

  const orderDetails = orderinfo.OrderInfo.Order.details;
  const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;
  const orderItems = orderinfo.OrderItem?.details || [];

  const clientorderID = generateOrderId();
  orderDetails.orderID = clientorderID;
  orderDetails.clientorderID = clientorderID;

  /* AI DESCRIPTION */
  try {
    if (userId) {
      const prefs = await fetchUserPreferences(userId);
      const restaurantName =
        restaurantDetails.restName ||
        restaurantDetails.name ||
        "Restaurant";

      const ai = await generateOrderDescription(
        prefs,
        orderItems,
        restaurantName
      );

      orderDetails.description = ai.description;
    }
  } catch {
    orderDetails.description = "";
  }

  /* PETPUJA */
  try {
    await placeOrderWithPetpuja(orderinfo);
  } catch (err) {
    return res.status(502).json({
      success: false,
      message: "PetPooja order failed",
    });
  }

  /* RAZORPAY */
  try {
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const total = Number(orderDetails.total);

    const rpOrder = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
      notes: {
        clientorderID,
        restID: restaurantDetails.restID,
        userId: userId || "guest",
      },
    });

    await supabase.from("orders").insert([
      {
        clientorderid: clientorderID,
        restaurantid: restaurantDetails.restID,
        user_id: userId || null,
        razorpay_order_id: rpOrder.id,
        amount: total,
        status: "pending_payment",
        ai_generated_description: orderDetails.description || null,
      },
    ]);

    return res.json({
      success: true,
      clientorderID,
      razorpayOrder: rpOrder,
      orderDescription: orderDetails.description || "",
    });

  } catch (err) {
    await cancelPetpujaOrder({
      restID: restaurantDetails.restID,
      clientorderID,
      cancelReason: "Payment initiation failed",
    });

    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
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

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

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

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
};

/* -------------------------------------------------------
   CANCEL ORDER (🔥 THIS WAS MISSING)
------------------------------------------------------- */
const cancelOrderOnPaymentfailed = async (req, res) => {
  const { restID, clientorderID, cancelReason } = req.body;

  if (!restID || !clientorderID) {
    return res.status(400).json({
      success: false,
      message: "Missing restID or clientorderID",
    });
  }

 try {
  const petpujaResult = await cancelPetpujaOrder({
    restID,
    clientorderID,
    cancelReason
  });

  await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("clientorderid", clientorderID);

  return res.json({
    success: true,
    petpuja: petpujaResult
  });
} catch (err) {
  return res.status(502).json({
    success: false,
    message: "PetPooja rejected cancellation",
    petpuja: err.details
  });
}

};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
};
