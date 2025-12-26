const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");

const { saveOrderSchema } = require("../validations/order.validation.js");
const {
  placeOrderWithPetpuja,
  cancelPetpujaOrder
} = require("../helpers/petpujaHelper.js");
const {
  createDeliveryTaskFromOrder,
  cancelDeliveryTask,
  trackTaskStatus
} = require("../helpers/riderHelper.js");
const { generateOrderId } = require("../../utils/generateOrderId.js");
const { fetchUserPreferences } = require("../helpers/serPreferencesHelper.js");
const { generateOrderDescription } = require("../services/gemini.orderEnhancer.js");
const { createClient } = require('@supabase/supabase-js');

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
  let rpOrder;
  try {
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const total = Number(orderDetails.total);

    rpOrder = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
      notes: {
        clientorderID,
        restID: restaurantDetails.restID,
        userId: userId || "guest",
      },
    });

    // Insert order into database with complete order info
    await supabase.from("orders").insert([
      {
        clientorderid: clientorderID,
        restaurantid: restaurantDetails.restID,
        user_id: userId || null,
        razorpay_order_id: rpOrder.id,
        amount: total,
        status: "pending_payment",
        ai_generated_description: orderDetails.description || null,
        order_data: orderinfo, // Store complete order info for rider task
      },
    ]);

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

  /* CREATE RIDER TASK - Automatically from order info */
  let riderTaskId = null;
  try {
    console.log("🚚 Creating rider delivery task...");
    
    const riderResult = await createDeliveryTaskFromOrder(
      orderinfo,
      clientorderID,
      userId
    );

    if (riderResult.success) {
      riderTaskId = riderResult.taskId;

      // Update order with rider task ID
      await supabase
        .from("orders")
        .update({ 
          rider_task_id: riderTaskId,
          rider_status: "ACCEPTED"
        })
        .eq("clientorderid", clientorderID);

      console.log(`✅ Rider task created: ${riderTaskId}`);
    } else {
      console.error("❌ Failed to create rider task:", riderResult.error);
      // Don't fail the order, just log the error
    }
  } catch (err) {
    console.error("❌ Rider task creation error:", err);
    // Don't fail the order creation if rider task fails
  }

  return res.json({
    success: true,
    clientorderID,
    razorpayOrder: rpOrder,
    orderDescription: orderDetails.description || "",
    riderTaskId: riderTaskId,
  });
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

    // Update order status to paid
    await supabase
      .from("orders")
      .update({ 
        status: "paid", 
        razorpay_payment_id,
        payment_verified_at: new Date().toISOString()
      })
      .eq("clientorderid", clientorderID);

    console.log(`✅ Payment verified for order: ${clientorderID}`);

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Payment verification error:", err);
    return res.status(500).json({ success: false });
  }
};

/* -------------------------------------------------------
   CANCEL ORDER ON PAYMENT FAILED
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
    // Get order details including rider task ID
    const { data: orderData } = await supabase
      .from("orders")
      .select("rider_task_id")
      .eq("clientorderid", clientorderID)
      .single();

    // Cancel PetPooja order
    const petpujaResult = await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason
    });

    // Cancel rider task if exists
    if (orderData?.rider_task_id) {
      console.log(`🚫 Cancelling rider task: ${orderData.rider_task_id}`);
      await cancelDeliveryTask(orderData.rider_task_id);
    }

    // Update order status
    await supabase
      .from("orders")
      .update({ 
        status: "cancelled",
        rider_status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason
      })
      .eq("clientorderid", clientorderID);

    console.log(`✅ Order cancelled: ${clientorderID}`);

    return res.json({
      success: true,
      petpuja: petpujaResult
    });
  } catch (err) {
    console.error("❌ Order cancellation error:", err);
    return res.status(502).json({
      success: false,
      message: "Cancellation failed",
      details: err.message
    });
  }
};

/* -------------------------------------------------------
   GET RIDER STATUS
------------------------------------------------------- */
const getRiderStatus = async (req, res) => {
  try {
    const { clientorderID } = req.params;

    if (!clientorderID) {
      return res.status(400).json({
        success: false,
        message: "Missing clientorderID",
      });
    }

    // Get order with rider task ID
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("clientorderid", clientorderID)
      .single();

    if (orderError || !orderData) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!orderData.rider_task_id) {
      return res.json({
        success: true,
        status: "no_rider_assigned",
        message: "No rider assigned yet",
      });
    }

    // Track rider status from uEngage
    const trackResult = await trackTaskStatus(orderData.rider_task_id);

    if (!trackResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch rider status",
        error: trackResult.error,
      });
    }

    // Update local database with latest status
    if (trackResult.statusCode) {
      await supabase
        .from("orders")
        .update({ 
          rider_status: trackResult.statusCode,
          rider_name: trackResult.data?.rider_name,
          rider_contact: trackResult.data?.rider_contact,
          rider_latitude: trackResult.data?.latitude,
          rider_longitude: trackResult.data?.longitude,
          tracking_url: trackResult.data?.tracking_url,
          partner_name: trackResult.data?.partner_name,
          last_status_update: new Date().toISOString()
        })
        .eq("clientorderid", clientorderID);
    }

    console.log(`📍 Rider status for ${clientorderID}: ${trackResult.statusCode}`);

    return res.json({
      success: true,
      statusCode: trackResult.statusCode,
      message: trackResult.message,
      riderData: trackResult.data,
    });
  } catch (err) {
    console.error("❌ Get rider status error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rider status",
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
  getRiderStatus
};