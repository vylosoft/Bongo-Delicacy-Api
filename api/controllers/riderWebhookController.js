const supabase = require("../../config/db");
const { riderStatusConfig } = require("../../config/constant");
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

    /**
     * 🔒 Validate payload
     */
    if (status !== true || !data || !data.taskId || !status_code) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid payload structure",
      });
    }

    const allowedStatus = [
      "ALLOTTED",
      "ARRIVED",
      "DISPATCHED",
      "ARRIVED_CUSTOMER_DOORSTEP",
      "DELIVERED",
      "CANCELLED",
    ];

    if (!allowedStatus.includes(status_code)) {
      console.log("⚠️ Unknown status_code:", status_code);
      return res.status(200).json({
        status: true,
        message: "Ignored unknown status",
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
      return res.status(500).json({ error: "DB fetch failed" });
    }

    if (!orderData) {
      console.log("⚠️ No order found for taskId:", taskId);
      return res.status(200).json({
        status: true,
        message: "No matching order found",
      });
    }

    /**
     * 🛑 Prevent duplicate webhook processing
     */
    if (orderData.delivery_info?.status_code === status_code) {
      console.log("⚠️ Duplicate webhook ignored");
      return res.status(200).json({
        status: true,
        message: "Duplicate ignored",
      });
    }

    /**
     * 🔄 Build updated delivery_info safely
     */
    const updatedDeliveryInfo = {
      ...orderData.delivery_info,
      rider_name:
        rider_name !== undefined
          ? rider_name
          : orderData.delivery_info?.rider_name,
      rider_contact:
        rider_contact !== undefined
          ? rider_contact
          : orderData.delivery_info?.rider_contact,
      rider_lat:
        latitude !== undefined
          ? latitude
          : orderData.delivery_info?.rider_lat,
      rider_long:
        longitude !== undefined
          ? longitude
          : orderData.delivery_info?.rider_long,
      tracking_url:
        tracking_url !== undefined
          ? tracking_url
          : orderData.delivery_info?.tracking_url,
      rto_reason:
        rto_reason !== undefined
          ? rto_reason
          : orderData.delivery_info?.rto_reason,
      status_code,
      last_updated_at: new Date().toISOString(),
    };

    /**
     * 🔄 Update delivery_info
     */
    const { error: updateError } = await supabase
      .from("orders")
      .update({ delivery_info: updatedDeliveryInfo })
      .eq("id", orderData.id);

    if (updateError) {
      console.log("❌ Update Error:", updateError);
      return res.status(500).json({ error: "Update failed" });
    }

    console.log("✅ Delivery info updated:", orderData.id);

    /**
     * 🔥 Fire-and-forget PetPooja rider update
     */
    (async () => {
      try {
        const riderPayload = {
          orderId: orderData.id,
          taskId,
        };

        // add only if valid
        if (rider_name && rider_name !== "Not Provided") {
          riderPayload.rider_name = rider_name;
        }

        if (rider_contact && rider_contact !== "Not Provided") {
          riderPayload.rider_contact = rider_contact;
        }

        await sendRiderDetailsToPetPuja({
          status_code,
          data: riderPayload,
        });

        console.log("📤 Sent rider details to PetPooja:", riderPayload);
      } catch (err) {
        console.error("❌ PetPooja rider update failed:", err.message);
      }
    })();

    /**
     * 🔄 Update order status
     */
    let updatedOrderStatus = null;

    const riderStatus = riderStatusConfig();

    if (status_code === riderStatus.DISPATCHED)
      updatedOrderStatus = "DISPATCHED";

    if (status_code === riderStatus.DELIVERED)
      updatedOrderStatus = "DELIVERED";

    if (updatedOrderStatus) {
      await supabase
        .from("orders")
        .update({ status: updatedOrderStatus })
        .eq("id", orderData.id);

      console.log("📦 Order status updated:", updatedOrderStatus);
    }

    /**
     * 🚨 CANCEL FLOW
     */
    if (status_code === "CANCELLED") {
      (async () => {
        try {
          console.log("🚨 Rider cancelled → cancelling PetPooja");

          await cancelPetpujaOrder({
            restID: orderData.brand_id,
            clientorderID: orderData.id,
            cancelReason: "Rider cancelled",
          });

          console.log("✅ PetPooja cancelled");
        } catch (err) {
          console.error("❌ PetPooja cancel failed:", err.message);
        }
      })();

      await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          delivery_info: {
            ...updatedDeliveryInfo,
            rider_cancelled: true,
          },
        })
        .eq("id", orderData.id);

      console.log("📦 Order marked CANCELLED");
    }

    /**
     * ✅ Always respond fast
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