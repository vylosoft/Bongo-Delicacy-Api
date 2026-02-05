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
  console.log("[CREATE_ORDER] Incoming request");

  const { error, value } = saveOrderSchema(req.body);
  if (error) {
    console.error("[CREATE_ORDER] Validation failed:", error);
    return res.status(400).json({ success: false });
  }

  const { orderinfo, userId } = value;
  const orderDetails = orderinfo.OrderInfo.Order.details;
  const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;
  const orderItems = orderinfo.OrderInfo.OrderItem?.details || [];

  const clientorderID = generateOrderId();
  orderDetails.orderID = clientorderID;
  orderDetails.clientorderID = clientorderID;

  console.log("[CREATE_ORDER] Generated clientorderID:", clientorderID);

  // DESCRIPTION
  try {
    if (userId) {
      console.log("[CREATE_ORDER] Fetching user preferences:", userId);

      const prefs = await fetchUserPreferences(userId);

      const restaurantName =
        restaurantDetails.restName || restaurantDetails.name || "Restaurant";

      console.log("[CREATE_ORDER] Generating AI description");

      const ai = await generateOrderDescription(
        prefs,
        orderItems,
        restaurantName,
      );

      orderDetails.description =
        typeof ai === "string" ? ai : ai?.description || "";

      console.log("[CREATE_ORDER] AI description set");
    } else {
      orderDetails.description = "";
      console.log("[CREATE_ORDER] No userId, description skipped");
    }
  } catch (err) {
    console.error("[CREATE_ORDER] AI description failed:", err);
    orderDetails.description = "";
  }

  // PetPooja
  try {
    console.log("[CREATE_ORDER] Sending order to PetPooja");
    await placeOrderWithPetpuja(orderinfo);
    console.log("[CREATE_ORDER] PetPooja order placed");
  } catch (err) {
    console.error("[CREATE_ORDER] PetPooja order failed:", err);
    return res.status(502).json({
      success: false,
      message: "PetPooja order failed",
    });
  }

  // Razorpay
  try {
    console.log("[CREATE_ORDER] Creating Razorpay order");

    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const rpOrder = await razorpay.orders.create({
      amount: Number(orderDetails.total) * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
    });

    console.log("[CREATE_ORDER] Razorpay order created:", rpOrder.id);

    return res.json({
      success: true,
      clientorderID,
      razorpayOrder: rpOrder,
    });
  } catch (err) {
    console.error("[CREATE_ORDER] Razorpay creation failed:", err);

    try {
      console.log("[CREATE_ORDER] Cancelling PetPooja order");
      await cancelPetpujaOrder({
        restID: restaurantDetails.restID,
        clientorderID,
        cancelReason: "Razorpay creation failed",
      });
    } catch (cancelErr) {
      console.error(
        "[CREATE_ORDER] Failed to cancel PetPooja order:",
        cancelErr,
      );
    }

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
  console.log("[VERIFY_PAYMENT] Incoming request");

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
    console.error("[VERIFY_PAYMENT] Signature mismatch", {
      expected,
      received: razorpay_signature,
    });

    try {
      await cancelPetpujaOrder({
        restID: orderData.brandId,
        clientorderID,
        cancelReason: "Signature mismatch",
      });
    } catch (err) {
      console.error("[VERIFY_PAYMENT] Failed to cancel PetPooja:", err);
    }

    return res.status(400).json({ success: false });
  }

  console.log("[VERIFY_PAYMENT] Signature verified");

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

    console.log("[VERIFY_PAYMENT] Inserting order into DB");

    const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      console.error("[VERIFY_PAYMENT] Supabase insert failed:", error);
      throw error;
    }

    console.log("[VERIFY_PAYMENT] Order saved successfully");

    return res.json({ success: true });
  } catch (err) {
    console.error("[VERIFY_PAYMENT] Order processing failed:", err);

    try {
      await cancelPetpujaOrder({
        restID: orderData.brandId,
        clientorderID,
        cancelReason: "DB insert failed",
      });
    } catch (cancelErr) {
      console.error("[VERIFY_PAYMENT] Failed to cancel PetPooja:", cancelErr);
    }

    return res.status(500).json({ success: false });
  }
};

/* -------------------------------------------------------
   CANCEL ON PAYMENT FAILURE
------------------------------------------------------- */
const cancelOrderOnPaymentfailed = async (req, res) => {
  console.log("[CANCEL_ORDER] Incoming request", req.body);

  const { restID, clientorderID, cancelReason } = req.body;

  try {
    await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason,
    });

    console.log("[CANCEL_ORDER] Order cancelled successfully");

    return res.json({ success: true });
  } catch (err) {
    console.error("[CANCEL_ORDER] Cancellation failed:", err);
    return res.status(500).json({ success: false });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
};
