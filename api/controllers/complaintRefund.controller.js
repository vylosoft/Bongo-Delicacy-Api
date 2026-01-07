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

/**
 * POST /api/complaints/refund
 * body: { orderId: string, refundAmount: number, reason?: string }
 */
const processComplaintRefund = async (req, res) => {
  try {
    const { orderId, refundAmount, reason = "Complaint refund" } = req.body;

    console.log("=== COMPLAINT REFUND ===", {
      orderId,
      refundAmount,
      reason,
    });

    /* ---------------------------------------------------
       1️⃣ BASIC VALIDATION
    --------------------------------------------------- */
    if (!orderId || refundAmount === undefined || refundAmount === null) {
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
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.complaint || order.complaint.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "No pending complaint found for this order",
      });
    }

    /* ---------------------------------------------------
       3️⃣ VALIDATE REFUND LIMIT
    --------------------------------------------------- */
    const totalOrderAmount = Number(order.total_amount || 0);

    if (numericAmount > totalOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount (₹${numericAmount}) cannot exceed total order amount (₹${totalOrderAmount})`,
      });
    }

    if (!order.external_order_id) {
      return res.status(400).json({
        success: false,
        message: "No Razorpay order/payment reference found",
      });
    }

    if (order.refund_status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Refund already completed for this order",
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
        amount: Math.round(numericAmount * 100), // paise
        notes: {
          reason,
          type: "complaint_refund",
          orderId,
        },
      });

      razorpayRefundId = refund.id;
      console.log("✅ Razorpay refund successful:", razorpayRefundId);
    } catch (err) {
      console.error("❌ Razorpay refund failed:", err);
      return res.status(500).json({
        success: false,
        message: "Razorpay refund failed",
        error: err.message,
      });
    }

    const now = new Date().toISOString();

    /* ---------------------------------------------------
       5️⃣ UPDATE COMPLAINT SNAPSHOT (IN ORDER)
    --------------------------------------------------- */
    const updatedComplaint = {
      ...order.complaint,
      status: "approved",
      refundedAmount: numericAmount,
      refundId: razorpayRefundId,
      resolvedAt: now,
    };

    /* ---------------------------------------------------
       6️⃣ UPDATE ORDER (NO STATUS CORRUPTION)
    --------------------------------------------------- */
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        // Order remains PAID
        status: "REFUNDED",

        refund_status: "completed",
        // refund_id: razorpayRefundId,
        complaint: updatedComplaint,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError || !updatedOrder) {
      return res.status(500).json({
        success: false,
        message: "Refund succeeded but order update failed",
      });
    }

    /* ---------------------------------------------------
       7️⃣ SUCCESS RESPONSE
    --------------------------------------------------- */
    return res.status(200).json({
      success: true,
      message: `₹${numericAmount} refunded successfully`,
      refundAmount: numericAmount,
      totalAmount: totalOrderAmount,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("❌ COMPLAINT REFUND ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing refund",
      error: err.message,
    });
  }
};

module.exports = { processComplaintRefund };
