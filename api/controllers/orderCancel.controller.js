const Razorpay = require("razorpay")
const { createClient } = require("@supabase/supabase-js")
const { cancelPetpujaOrder } = require("../helpers/petpujaHelper")
const env = require("../../config/env.js")

const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY"
)

const cancelOrder = async (req, res) => {
  try {
    const clientorderID = req.body.clientorderID;
    const reason = req.body.reason || "Cancelled by customer";
    const amount = req.body.amount;

    /* ---------------------------------------------------
       1️⃣ VALIDATION
    --------------------------------------------------- */
    if (!clientorderID) {
      return res.status(400).json({
        success: false,
        message: "clientorderID is required",
      });
    }

    const refundAmount = Number(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid refund amount is required",
      });
    }

    /* ---------------------------------------------------
       2️⃣ FETCH ORDER
    --------------------------------------------------- */
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", clientorderID)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Order already cancelled",
      });
    }

    if (order.refund_status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Refund already completed for this order",
      });
    }

    /* ---------------------------------------------------
       3️⃣ REFUND SAFETY CHECK
    --------------------------------------------------- */
    const capturedAmountPaise = Math.round(
      Number(order.total_amount) * 100
    );

    if (refundAmount > capturedAmountPaise) {
      return res.status(400).json({
        success: false,
        message: "Refund amount cannot exceed order total",
      });
    }

    /* ---------------------------------------------------
       4️⃣ RAZORPAY REFUND (IF PAID)
    --------------------------------------------------- */
    let razorpayRefundId = null;

    if (order.external_order_id) {
      const razorpay = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET,
      });

      try {
        const refund = await razorpay.payments.refund(order.refund_id, {
          amount: Math.round(refundAmount * 100),
          notes: {
            reason,
            clientorderID,
            type: "order_cancel_refund",
          },
        });

        razorpayRefundId = refund.id;
      } catch (err) {
        console.error("Razorpay refund failed:", err);
        return res.status(500).json({
          success: false,
          message: "Refund failed at payment gateway",
        });
      }
    }

    /* ---------------------------------------------------
       5️⃣ PETPUJA CANCEL (BEST-EFFORT)
    --------------------------------------------------- */
    try {
      await cancelPetpujaOrder({
        restID: order.brand_id,
        clientorderID,
        cancelReason: reason,
      });
    } catch (err) {
      console.warn("PetPuja cancel failed:", err.message);
    }

    /* ---------------------------------------------------
       6️⃣ UPDATE ORDER (CLEAN + HONEST)
    --------------------------------------------------- */
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "CANCELLED",
        refund_status: razorpayRefundId ? "completed" : null,

      })
      .eq("id", clientorderID)
      .select()
      .single();

    if (updateError || !updatedOrder) {
      return res.status(500).json({
        success: false,
        message: "Failed to update order",
      });
    }

    /* ---------------------------------------------------
       7️⃣ SUCCESS
    --------------------------------------------------- */
    return res.json({
      success: true,
      message: "Order cancelled successfully",
      refundAmount,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Cancel order error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { cancelOrder };