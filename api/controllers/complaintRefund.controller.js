// complaintRefund.controller.js

const Razorpay = require("razorpay");
const env = require("../../config/env");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY"
);

/**
 * POST /api/complaints/refund
 * body: { orderId: string, refundAmount: number, reason?: string }
 */
const processComplaintRefund = async (req, res) => {
  try {
    const { orderId, refundAmount, reason = "Complaint refund" } = req.body;

    console.log("🟡 COMPLAINT REFUND REQUEST", {
      orderId,
      refundAmount,
      reason,
    });

    /* ---------------------------------------------------
       1️⃣ VALIDATION
    --------------------------------------------------- */
    if (!orderId || refundAmount == null) {
      return res.status(400).json({
        success: false,
        message: "orderId and refundAmount are required",
      });
    }

    const numericAmount = Number(refundAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Refund amount must be greater than 0",
      });
    }

    /* ---------------------------------------------------
       2️⃣ FETCH ORDER
    --------------------------------------------------- */
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      console.error("❌ ORDER FETCH FAILED", fetchError);
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log("🟢 ORDER FOUND", {
      id: order.id,
      total_amount: order.total_amount,
      refund_amount: order.refund_amount,
      refund_status: order.refund_status,
    });

    if (!order.complaint || order.complaint.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "No pending complaint found for this order",
      });
    }

    if (!order.external_order_id) {
      return res.status(400).json({
        success: false,
        message: "No Razorpay payment reference found",
      });
    }

    if (order.refund_status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Refund already completed",
      });
    }

    /* ---------------------------------------------------
       3️⃣ REFUND LIMIT CHECK
    --------------------------------------------------- */
    const totalOrderAmount = Number(order.total_amount || 0);

    if (numericAmount > totalOrderAmount) {
      return res.status(400).json({
        success: false,
        message: "Refund amount exceeds order total",
      });
    }

    /* ---------------------------------------------------
       4️⃣ RAZORPAY REFUND
    --------------------------------------------------- */
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    let razorpayRefundId;

    try {
      const refund = await razorpay.payments.refund(order.refund_id, {
        amount: Math.round(numericAmount * 100),
        notes: {
          reason,
          type: "complaint_refund",
          orderId,
        },
      });

      razorpayRefundId = refund.id;

      console.log("✅ RAZORPAY REFUND SUCCESS", razorpayRefundId);
    } catch (err) {
      console.error("❌ RAZORPAY REFUND FAILED", err);
      return res.status(500).json({
        success: false,
        message: "Razorpay refund failed",
        error: err.message,
      });
    }

    const now = new Date().toISOString();

    /* ---------------------------------------------------
       5️⃣ UPDATE COMPLAINT SNAPSHOT
    --------------------------------------------------- */
    const updatedComplaint = {
      ...order.complaint,
      status: "approved",
      refundedAmount: numericAmount,
      refundId: razorpayRefundId,
      resolvedAt: now,
    };

    /* ---------------------------------------------------
       6️⃣ UPDATE ORDER (SAVE AS CANCEL)
    --------------------------------------------------- */
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "REFUNDED",
        refund_status: "completed",
        refund_amount: numericAmount,
        refunded_at: now,
        complaint: updatedComplaint,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError || !updatedOrder) {
      console.error("❌ ORDER UPDATE FAILED", updateError);
      return res.status(500).json({
        success: false,
        message: "Refund succeeded but order update failed",
      });
    }

    console.log("🟢 ORDER UPDATED", {
      id: updatedOrder.id,
      refund_amount: updatedOrder.refund_amount,
      refunded_at: updatedOrder.refunded_at,
    });

    /* ---------------------------------------------------
       7️⃣ SUCCESS
    --------------------------------------------------- */
    return res.status(200).json({
      success: true,
      message: `₹${numericAmount} refunded successfully`,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("🔥 COMPLAINT REFUND ERROR", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

module.exports = { processComplaintRefund };
