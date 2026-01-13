const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");

const { saveOrderSchema } = require("../validations/order.validation.js");
const {
  placeOrderWithPetpuja,
  cancelPetpujaOrder,
} = require("../helpers/petpujaHelper.js");

const { generateOrderId } = require("../../utils/generateOrderId.js");
const { fetchUserPreferences } = require("../helpers/serPreferencesHelper.js");
const {
  generateOrderDescription,
} = require("../services/gemini.orderEnhancer.js");

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nldgaczpzfmwamivniua.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------------------------------------
   CREATE ORDER
------------------------------------------------------- */
const createOrder = async (req, res) => {
  const { error, value } = saveOrderSchema(req.body);
  if (error) {
    return res.status(400).json({ success: false });
  }

  const { orderinfo, userId } = value; // ✅ only added userId
  const orderDetails = orderinfo.OrderInfo.Order.details;
  const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;
  const orderItems = orderinfo.OrderInfo.OrderItem?.details || []; // ✅ only added orderItems

  const clientorderID = generateOrderId();
  orderDetails.orderID = clientorderID;
  orderDetails.clientorderID = clientorderID;

  // ✅ DESCRIPTION (only fix)
  try {
    if (userId) {
      const prefs = await fetchUserPreferences(userId);

      const restaurantName =
        restaurantDetails.restName || restaurantDetails.name || "Restaurant";

      const ai = await generateOrderDescription(
        prefs,
        orderItems,
        restaurantName
      );

      // ✅ support both: string OR { description }
      orderDetails.description =
        typeof ai === "string" ? ai : ai?.description || "";
    } else {
      orderDetails.description = "";
    }
  } catch (err) {
    console.error("AI description failed:", err);
    orderDetails.description = "";
  }

  // 1️⃣ PetPooja (unchanged)
  try {
    await placeOrderWithPetpuja(orderinfo);
  } catch {
    return res.status(502).json({
      success: false,
      message: "PetPooja order failed",
    });
  }

  // 2️⃣ Razorpay (unchanged)
  try {
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const rpOrder = await razorpay.orders.create({
      amount: Number(orderDetails.total) * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
    });

    return res.json({
      success: true,
      clientorderID,
      razorpayOrder: rpOrder,
    });
  } catch {
    await cancelPetpujaOrder({
      restID: restaurantDetails.restID,
      clientorderID,
      cancelReason: "Razorpay creation failed",
    });

    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
    });
  }
};


/* -------------------------------------------------------
   VERIFY PAYMENT + CREATE DB ORDER
------------------------------------------------------- */
const verifyPayment = async (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    clientorderID,
    orderData,
  } = req.body;

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    await cancelPetpujaOrder({
      restID: orderData.brandId,
      clientorderID,
      cancelReason: "Signature mismatch",
    });

    return res.status(400).json({ success: false });
  }

  try {
    const {
      brandId,
      userId,
      items,
      customer,
      deliveryAddress,
      subtotal,
      loyaltyPointsToRedeem,
    } = orderData;

    // SAME LOGIC AS apiCreateOrder
    const discountAmount = 0;
    const totalBeforeGst = Math.max(0, subtotal - loyaltyPointsToRedeem);
    const gstAmount = totalBeforeGst * 0.05;
    const finalTotal = totalBeforeGst + gstAmount;
    const pointsEarned = Math.floor(finalTotal / 100);

    const orderRow = {
      id: clientorderID,
      brand_id: brandId,
      user_id: userId,
      items,
      customer,
      delivery_address: deliveryAddress,
      subtotal,
      discount_amount: discountAmount,
      loyalty_discount: loyaltyPointsToRedeem,
      gst_amount: gstAmount,
      total_amount: finalTotal,
      points_earned: pointsEarned,
      status: "received",
      external_order_id: razorpay_order_id,
      refund_id: razorpay_payment_id,
      created_at: new Date().toISOString(),
    };

    await supabase.from("orders").insert(orderRow);

    return res.json({ success: true });
  } catch (err) {
    await cancelPetpujaOrder({
      restID: orderData.brandId,
      clientorderID,
      cancelReason: "DB insert failed",
    });

    return res.status(500).json({ success: false });
  }
};

/* -------------------------------------------------------
   CANCEL ON PAYMENT FAILURE
------------------------------------------------------- */
const cancelOrderOnPaymentfailed = async (req, res) => {
  const { restID, clientorderID, cancelReason } = req.body;

  try {
    await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason,
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
};