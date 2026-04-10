const axios = require("axios");
const env = require("../../config/env");
const { riderStatusConfig } = require("../../config/constant");

// axios instance for PetPooja
const petpujaClient = axios.create({
  baseURL: process.env.PETPUJA_BASE_URL,
  timeout: 30000,
});

/**
 * Place order with PetPooja
 */
const placeOrderWithPetpuja = async (orderinfo) => {
  const payload = {
    app_key: process.env.APP_KEY,
    app_secret: process.env.APP_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    orderinfo,
  };

  try {
    const { data } = await petpujaClient.post("/save_order", payload);
    return data;
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;

    const e = new Error(
      `PetPooja Error ${status}: ${JSON.stringify(details)}`
    );

    e.statusCode = status;
    e.details = details;
    throw e;
  }
};

/**
 * Cancel PetPooja order
 */
const cancelPetpujaOrder = async ({
  restID,
  clientorderID,
  cancelReason = "Payment failed",
}) => {
  const payload = {
    app_key: process.env.APP_KEY,
    app_secret: process.env.APP_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    restID,
    orderID: "",
    clientorderID,
    cancelReason,
    status: "-1",
  };

  try {
    const { data } = await petpujaClient.post(
      "/update_order_status",
      payload
    );

    return data;
  } catch (error) {
    const errData = error.response?.data || error.message;
    const status = error.response?.status || 500;

    const e = new Error("Failed to cancel order in PetPooja");
    e.statusCode = status;
    e.details = errData;
    throw e;
  }
};

/**
 * 🔥 SEND RIDER STATUS TO PETPOOJA (UPDATED)
 */
const sendRiderDetailsToPetPuja = async (riderInfo) => {
  try {
    const status = riderStatusPetpujaStatusMapping(riderInfo.status_code);

    if (!status) {
      console.log("⚠️ No mapping for status:", riderInfo.status_code);
      return { success: false };
    }

    const payload = {
      app_key: process.env.APP_KEY,
      app_secret: process.env.APP_SECRET,
      access_token: process.env.ACCESS_TOKEN,
      order_id: riderInfo.data.orderId,
      outlet_id: "89",
      status: status,
      rider_data: {
        rider_name: riderInfo.data.rider_name,
        rider_phone_number: riderInfo.data.rider_contact,
      },
      external_order_id: "",
    };

    console.log("📤 Sending rider update to PetPooja:", payload);

    const { data } = await axios.post(
      "https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/rider_status_update",
      payload
    );

    return {
      success: true,
      data,
    };

  } catch (error) {
    console.error("❌ PetPooja rider update failed:", error.message);

    return {
      success: false,
    };
  }
};

/**
 * 🔥 STATUS MAPPING
 */
const riderStatusPetpujaStatusMapping = (riderStatus) => {
  const riderStatusConst = riderStatusConfig();

  if (riderStatusConst.ALLOTTED === riderStatus) return "rider-assigned";
  if (riderStatusConst.ARRIVED === riderStatus) return "rider-arrived";
  if (riderStatusConst.DISPATCHED === riderStatus) return "pickedup";
  if (riderStatusConst.DELIVERED === riderStatus) return "delivered";
  if (riderStatusConst.CANCELLED === riderStatus) return -1;

  return "";
};

module.exports = {
  placeOrderWithPetpuja,
  cancelPetpujaOrder,
  sendRiderDetailsToPetPuja,
};