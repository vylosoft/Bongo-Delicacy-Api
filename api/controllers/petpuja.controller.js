const { orderStatusConfig } = require("../../config/constant");
const Razorpay = require("razorpay");
const env = require("../../config/env.js");
const supabase = require("../../config/db");

exports.updateOrderStatus = async (req, res) => {
  try {
    console.log("PetPuja Callback Received:", req.body);

    const statusIndicator = parseInt(req.body.status);
    const orderId = req.body.orderID;   // this is your clientorderID
    const restID = req.body.restID;

    /* ---------------------------------------------------
       1️⃣ FETCH ORDER FROM DB FIRST (needed for refund + validation)
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
       2️⃣ IF STATUS -1 → FULL REFUND THEN CANCEL
    --------------------------------------------------- */
    if (statusIndicator === -1) {
      console.log(`[CALLBACK] Status -1 received for order ${orderId} — initiating full refund`);

      // Guard: already cancelled/refunded
      if (order.status === "CANCELLED") {
        console.warn("[CALLBACK] Order already cancelled, skipping");
        return res.status(200).json({
          success: "1",
          message: "Order already cancelled",
          restID,
          orderID: orderId,
          status: "-1",
        });
      }

      if (order.refund_status === "completed") {
        console.warn("[CALLBACK] Refund already completed, skipping");
        return res.status(200).json({
          success: "1",
          message: "Refund already completed",
          restID,
          orderID: orderId,
          status: "-1",
        });
      }

      /* ── RAZORPAY FULL REFUND ── */
      let razorpayRefundId = null;

      if (order.refund_id) {
        try {
          const razorpay = new Razorpay({
            key_id: env.RAZORPAY_KEY_ID,
            key_secret: env.RAZORPAY_KEY_SECRET,
          });

          // total_amount is stored in ₹, Razorpay needs paise
          const refundAmountPaise = Math.round(Number(order.total_amount) * 100);

          console.log(`[CALLBACK] Refunding ₹${order.total_amount} (${refundAmountPaise} paise) for payment ${order.refund_id}`);

          const refund = await razorpay.payments.refund(order.refund_id, {
            amount: refundAmountPaise,
            notes: {
              reason: req.body.cancel_reason || "Cancelled by restaurant",
              clientorderID: orderId,
              type: "petpuja_cancel_refund",
            },
          });

          razorpayRefundId = refund.id;
          console.log(`[CALLBACK] Razorpay refund successful: ${razorpayRefundId}`);
        } catch (err) {
          console.error("[CALLBACK] Razorpay refund failed:", err);
          // Still update order as cancelled even if refund fails — log it
        }
      } else {
        console.warn("[CALLBACK] No refund_id found on order — skipping Razorpay refund");
      }

      /* ── UPDATE DB ── */
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          refund_status: razorpayRefundId ? "completed" : "failed",
          refund_amount: order.total_amount,
          refunded_at: razorpayRefundId ? new Date().toISOString() : null,
        })
        .eq("id", orderId);

      if (updateError) {
        console.error("[CALLBACK] DB update failed:", updateError);
        return res.status(500).json({ success: "0", message: "Failed to update order" });
      }

      console.log(`[CALLBACK] Order ${orderId} cancelled and refund processed`);

      return res.status(200).json({
        success: "1",
        message: "Order cancelled and refund initiated",
        restID,
        orderID: orderId,
        status: "-1",
      });
    }

    /* ---------------------------------------------------
       3️⃣ ALL OTHER STATUSES → normal status update
    --------------------------------------------------- */
    const statusMap = orderStatusConfig();
    const orderStatus = statusMap.get(statusIndicator);

    console.log("Mapped Order Status:", orderStatus);

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
      message: "Order status updated successfully.",
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