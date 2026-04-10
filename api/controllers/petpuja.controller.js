const { orderStatusConfig } = require("../../config/constant");
const Razorpay = require("razorpay");
const env = require("../../config/env.js");
const supabase = require("../../config/db");

// 🔥 ADD THIS
const { cancelDeliveryTask } = require("../helpers/riderHelper");

exports.updateOrderStatus = async (req, res) => {
  try {
    console.log("PetPuja Callback Received:", req.body);

    const statusIndicator = parseInt(req.body.status);
    const orderId = req.body.orderID;
    const restID = req.body.restID;

    /* ---------------------------------------------------
       1️⃣ FETCH ORDER FROM DB
    --------------------------------------------------- */
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ success: "0", message: "Order not found" });
    }

    /* ---------------------------------------------------
       2️⃣ IF STATUS -1 → CANCEL + REFUND + RIDER CANCEL
    --------------------------------------------------- */
    if (statusIndicator === -1) {
      console.log(`[CALLBACK] Status -1 received for order ${orderId}`);

      // already cancelled
      if (order.status === "CANCELLED") {
        return res.status(200).json({
          success: "1",
          message: "Order already cancelled",
          restID,
          orderID: orderId,
          status: "-1",
        });
      }

      // 🔥 STEP 1 — CANCEL RIDER
      try {
        const taskId = order?.delivery_info?.taskId;

        if (taskId) {
          console.log("🚨 Cancelling rider task:", taskId);

          const cancelResp = await cancelDeliveryTask(taskId);

          if (!cancelResp.success) {
            console.error("❌ Rider cancel failed:", cancelResp.error);
          } else {
            console.log("✅ Rider cancelled successfully");
          }
        } else {
          console.log("⚠️ No rider assigned, skipping cancel");
        }
      } catch (err) {
        console.error("🔥 Rider cancel error:", err.message);
      }

      // 🔥 STEP 2 — REFUND
      let razorpayRefundId = null;

      if (order.refund_id) {
        try {
          const razorpay = new Razorpay({
            key_id: env.RAZORPAY_KEY_ID,
            key_secret: env.RAZORPAY_KEY_SECRET,
          });

          const refundAmountPaise = Math.round(Number(order.total_amount) * 100);

          const refund = await razorpay.payments.refund(order.refund_id, {
            amount: refundAmountPaise,
            notes: {
              reason: req.body.cancel_reason || "Cancelled by restaurant",
              clientorderID: orderId,
            },
          });

          razorpayRefundId = refund.id;
          console.log("✅ Refund success:", razorpayRefundId);
        } catch (err) {
          console.error("❌ Refund failed:", err);
        }
      }

      // 🔥 STEP 3 — UPDATE DB
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          refund_status: razorpayRefundId ? "completed" : "failed",
          refund_amount: order.total_amount,
          refunded_at: razorpayRefundId ? new Date().toISOString() : null,

          // 👇 ADD THIS
          delivery_info: {
            ...order.delivery_info,
            rider_status: "CANCELLED",
          },
        })
        .eq("id", orderId);

      if (updateError) {
        console.error("❌ DB update failed:", updateError);
        return res.status(500).json({ success: "0" });
      }

      console.log(`✅ Order ${orderId} cancelled fully`);

      return res.status(200).json({
        success: "1",
        message: "Order cancelled",
        restID,
        orderID: orderId,
        status: "-1",
      });
    }

    /* ---------------------------------------------------
       3️⃣ NORMAL STATUS UPDATE
    --------------------------------------------------- */
    const statusMap = orderStatusConfig();
    const orderStatus = statusMap.get(statusIndicator);

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: orderStatus })
      .eq("id", orderId);

    if (updateError) {
      console.error("Supabase Update Error:", updateError);
      return res.status(500).json({
        success: "0",
        message: "Failed to update order status",
      });
    }

    return res.status(200).json({
      success: "1",
      message: "Order status updated",
      restID,
      orderID: orderId,
      status: String(statusIndicator),
    });

  } catch (err) {
    console.error("Callback Error:", err);
    return res.status(500).json({
      success: "0",
      message: "Internal Server Error",
    });
  }
};