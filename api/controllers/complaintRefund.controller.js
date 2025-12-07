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

    console.log("=== COMPLAINT REFUND DEBUG ===");
    console.log("orderId:", orderId);
    console.log("refundAmount:", refundAmount);
    console.log("reason:", reason);

    // Validation
    if (!orderId || refundAmount === undefined || refundAmount === null) {
      return res.status(400).json({
        success: false,
        message: "orderId and refundAmount are required"
      });
    }

    const numericAmount = Number(refundAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Refund amount must be greater than 0"
      });
    }

    // 1) FETCH ORDER
    console.log("Fetching order from DB...");
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    console.log("Fetch result:", { order, fetchError });

    if (fetchError || !order) {
      console.error("Order fetch error:", fetchError);
      return res.status(404).json({
        success: false,
        message: "Order not found",
        error: fetchError?.message
      });
    }

    // 2) VALIDATE REFUND AMOUNT <= TOTAL ORDER AMOUNT
    const totalOrderAmount = Number(order.totalAmount || 0);
    
    if (numericAmount > totalOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount (₹${numericAmount}) cannot exceed total order amount (₹${totalOrderAmount})`
      });
    }

    console.log(`Refund validation passed: ₹${numericAmount} <= ₹${totalOrderAmount}`);

    if (!order.razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        message: "No Razorpay payment found. Cannot refund."
      });
    }

    // 3) RAZORPAY REFUND
    console.log("Processing Razorpay refund...");
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });

    try {
      const refund = await razorpay.payments.refund(order.razorpay_payment_id, {
        amount: numericAmount * 100, // Convert to paise
        notes: {
          reason,
          type: "complaint_refund",
          orderId
        }
      });
      console.log("Razorpay refund successful:", refund.id);
    } catch (razorpayError) {
      console.error("Razorpay refund failed:", razorpayError);
      return res.status(500).json({
        success: false,
        message: "Razorpay refund failed",
        error: razorpayError.message
      });
    }

    // 4) UPDATE COMPLAINT STATUS
    console.log("Updating complaint status...");
    const { error: complaintUpdateError } = await supabase
      .from("complaints")
      .update({
        status: "approved"
      })
      .eq("orderId", orderId);

    if (complaintUpdateError) {
      console.error("Complaint update error:", complaintUpdateError);
      // Continue even if this fails - refund was successful
    }

    // 5) UPDATE ORDER STATUS TO REFUNDED
    console.log("Updating order status to REFUNDED...");
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "REFUNDED"
      })
      .eq("id", orderId)
      .select();

    console.log("Update result:", { updatedOrder, updateError });

    if (updateError) {
      console.error("❌ SUPABASE UPDATE FAILED:", updateError);
      return res.status(500).json({
        success: false,
        message: "Failed to update order status in database",
        error: updateError.message,
        details: updateError
      });
    }

    if (!updatedOrder || updatedOrder.length === 0) {
      console.error("❌ UPDATE RETURNED NO DATA");
      return res.status(500).json({
        success: false,
        message: "Order update returned no data - possible RLS issue"
      });
    }

    console.log("✅ Order updated successfully:", updatedOrder[0]);

    return res.status(200).json({
      success: true,
      message: `₹${numericAmount} refunded successfully (${((numericAmount/totalOrderAmount)*100).toFixed(1)}% of order total)`,
      refundAmount: numericAmount,
      totalAmount: totalOrderAmount,
      order: updatedOrder[0]
    });

  } catch (err) {
    console.error("❌ COMPLAINT REFUND ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing refund",
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

module.exports = { processComplaintRefund };