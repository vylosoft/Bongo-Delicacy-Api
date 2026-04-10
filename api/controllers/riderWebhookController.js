const supabase = require("../../config/db");

// 🔥 IMPORTS
const {
  cancelPetpujaOrder,
  sendRiderDetailsToPetPuja,
} = require("../helpers/petpujaHelper");

/**
 * Rider Webhook Controller
 */
const riderWebhookController = async (req, res) => {
  try {
    console.log("📥 Rider Webhook Hit");

    const payload = req.body;
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    const { status, data, status_code } = payload;

    // 🔒 Validate payload
    if (!status || !data || !data.taskId) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid payload structure",
      });
    }

    const {
      taskId,
      rider_name,
      rider_contact,
      latitude,
      longitude,
      tracking_url,
      rto_reason,
    } = data;

    console.log("📍 Task ID:", taskId);
    console.log("📊 Status:", status_code);

    /**
     * 🔍 Find order using taskId
     */
    const { data: orderData, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("delivery_info->>taskId", taskId)
      .maybeSingle();

    if (fetchError) {
      console.log("❌ Fetch Error:", fetchError);
    }

    if (!orderData) {
      console.log("⚠️ No order found for taskId:", taskId);

      return res.status(200).json({
        status: true,
        message: "No matching order found",
      });
    }

    /**
     * 🔄 Update delivery_info
     */
    const updatedDeliveryInfo = {
      ...orderData.delivery_info,
      rider_name: rider_name || orderData.delivery_info?.rider_name,
      rider_contact: rider_contact || orderData.delivery_info?.rider_contact,
      rider_lat: latitude || orderData.delivery_info?.rider_lat,
      rider_long: longitude || orderData.delivery_info?.rider_long,
      tracking_url: tracking_url || orderData.delivery_info?.tracking_url,
      rto_reason: rto_reason || null,
      status_code: status_code,
    };

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_info: updatedDeliveryInfo,
      })
      .eq("id", orderData.id);

    if (updateError) {
      console.log("❌ Update Error:", updateError);
    } else {
      console.log("✅ Delivery info updated:", orderData.id);
    }

    /**
     * 🔥 SEND RIDER STATUS TO PETPOOJA (NEW)
     */
    await sendRiderDetailsToPetPuja({
      status_code,
      data,
    });

    /**
     * 🔥 UPDATE ORDER STATUS FROM RIDER
     */
    let updatedOrderStatus = null;

    if (status_code === "DISPATCHED") {
      updatedOrderStatus = "DISPATCHED";
    }

    if (status_code === "DELIVERED") {
      updatedOrderStatus = "DELIVERED";
    }

    if (updatedOrderStatus) {
      await supabase
        .from("orders")
        .update({ status: updatedOrderStatus })
        .eq("id", orderData.id);

      console.log("📦 Order status updated:", updatedOrderStatus);
    }

    /**
     * 🔥 RIDER CANCEL → CANCEL PETPOOJA
     */
    if (status_code === "CANCELLED") {
      try {
        console.log("🚨 Rider cancelled → cancelling PetPooja");

        await cancelPetpujaOrder({
          restID: orderData.brand_id,
          clientorderID: orderData.id,
          cancelReason: "Rider cancelled",
        });

        console.log("✅ PetPooja cancelled due to rider");

      } catch (err) {
        console.error("❌ PetPooja cancel failed:", err.message);
      }
    }

    /**
     * ✅ Always respond quickly
     */
    return res.status(200).json({
      status: true,
      message: "Webhook Processed",
    });

  } catch (error) {
    console.error("🔥 Webhook Error:", error);

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
};

module.exports = {
  riderWebhookController,
};