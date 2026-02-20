const Razorpay = require("razorpay");
const { orderStatusConfig } = require("../../config/constant");
const { cancelPetpujaOrder } = require("../helpers/petpujaHelper");
const env = require("../../config/env.js");
const supabase = require("../../config/db");

async function handleFullRefund(order) {
  let razorpayRefundId = null;

  if (order.external_order_id) {
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const refundAmountPaise = Math.round(Number(order.total_amount) * 100);

    const refund = await razorpay.payments.refund(order.refund_id, {
      amount: refundAmountPaise,
      notes: {
        reason: "Order rejected by restaurant",
        clientorderID: order.id,
        type: "order_rejected_full_refund",
      },
    });

    razorpayRefundId = refund.id;
  }

  return razorpayRefundId;
}

exports.updateOrderStatus = async (req, res) => {
  try {
    console.log("PetPuja Callback Received:", req.body);

    const statusIndicator = parseInt(req.body.status);
    const orderId = req.body.orderID;
    const restID = req.body.restID;

    const statusMap = orderStatusConfig();
    const orderStatus = statusMap.get(statusIndicator);

    console.log("Mapped Order Status:", orderStatus);

    /* ---------------------------------------------------
       FETCH ORDER
    --------------------------------------------------- */
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({
        success: "0",
        message: "Order not found",
      });
    }

    /* ---------------------------------------------------
       STATUS -1 → REJECTED → FULL REFUND
    --------------------------------------------------- */
    if (statusIndicator === -1) {
      // Guard: skip if already cancelled/refunded
      if (order.status === "CANCELLED") {
        return res.status(200).json({
          success: "1",
          message: "Order already cancelled",
          restID,
          orderID: orderId,
          status: String(statusIndicator),
        });
      }

      if (order.refund_status === "completed") {
        return res.status(200).json({
          success: "1",
          message: "Refund already completed",
          restID,
          orderID: orderId,
          status: String(statusIndicator),
        });
      }

      // Razorpay full refund
      let razorpayRefundId = null;
      try {
        razorpayRefundId = await handleFullRefund(order);
      } catch (err) {
        console.error("Razorpay refund failed:", err);
        return res.status(500).json({
          success: "0",
          message: "Refund failed at payment gateway",
        });
      }

      // PetPooja cancel (best-effort)
      try {
        await cancelPetpujaOrder({
          restID: order.brand_id,
          clientorderID: orderId,
          cancelReason: "Order rejected by restaurant",
        });
      } catch (err) {
        console.warn("PetPuja cancel failed:", err.message);
      }

      // Update DB
      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          refund_status: razorpayRefundId ? "completed" : null,
          refund_amount: Math.round(Number(order.total_amount) * 100),
          refunded_at: razorpayRefundId ? new Date().toISOString() : null,
        })
        .eq("id", orderId)
        .select()
        .single();

      if (updateError || !updatedOrder) {
        return res.status(500).json({
          success: "0",
          message: "Failed to update order after refund",
        });
      }

      return res.status(200).json({
        success: "1",
        message: "Order rejected and full refund processed",
        restID,
        orderID: orderId,
        status: String(statusIndicator),
        refundId: razorpayRefundId,
      });
    }

    /* ---------------------------------------------------
       NORMAL STATUS UPDATE
    --------------------------------------------------- */
    const { data, error } = await supabase
      .from("orders")
      .update({ status: orderStatus })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Supabase Update Error:", error);
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