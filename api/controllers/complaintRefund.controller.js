// complaintRefund.controller.js

const Razorpay = require("razorpay");
const env = require("../../config/env");
const { createClient } = require("@supabase/supabase-js");

// ❗ Use STATIC Supabase client like the rest of your project
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

    if (!orderId || !refundAmount) {
      return res.status(400).json({
        success: false,
        message: "orderId and refundAmount are required"
      });
    }

    const numericAmount = Number(refundAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid refundAmount"
      });
    }

    // 1) FETCH ORDER
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (!order.razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        message: "No Razorpay payment found. Cannot refund."
      });
    }

    // 2) RAZORPAY REFUND
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });

    await razorpay.payments.refund(order.razorpay_payment_id, {
      amount: numericAmount * 100,
      notes: {
        reason,
        type: "complaint_refund",
        orderId
      }
    });

    // 3) UPDATE COMPLAINT & ORDER RECORDS
    await supabase
      .from("complaints")
      .update({
        status: "approved",
        updatedAt: new Date().toISOString()
      })
      .eq("orderId", orderId);

    await supabase
      .from("orders")
      .update({
        additionalRefund: (order.additionalRefund || 0) + numericAmount
      })
      .eq("id", orderId);

    return res.status(200).json({
      success: true,
      message: `₹${numericAmount} refunded successfully`
    });

  } catch (err) {
    console.error("COMPLAINT REFUND ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing refund",
      error: err.message
    });
  }
};

module.exports = { processComplaintRefund };
