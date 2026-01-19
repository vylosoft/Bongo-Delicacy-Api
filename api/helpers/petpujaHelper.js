// helpers/petpujaHelper.js
const axios = require("axios");
const env = require("../../config/env");
const { riderStatusConfig } = require("../../config/constant");

// axios instance for PetPooja
const petpujaClient = axios.create({
  baseURL: process.env.PETPUJA_BASE_URL,
  timeout: 10000
});

/**
 * Place order with PetPooja (save_order)
 *
 * @param {object} orderinfo - the "orderinfo" object (WITHOUT app_key/app_secret/access_token)
 * @returns {Promise<object>} PetPooja response data
 */
const placeOrderWithPetpuja = async (orderinfo) => {
  const payload = {
    app_key: process.env.APP_KEY,
    app_secret: process.env.APP_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    orderinfo
  };

  // ✅ Safe log (recommended)
  const safePayload = {
    ...payload,
    app_key: payload.app_key ? `${payload.app_key.slice(0, 4)}****` : null,
    app_secret: payload.app_secret ? `${payload.app_secret.slice(0, 4)}****` : null,
    access_token: payload.access_token ? `${payload.access_token.slice(0, 6)}****` : null
  };

  console.log("PetPooja /save_order payload:", JSON.stringify(safePayload, null, 2));

  // ❗ If you really want full payload (use only in local dev)
   console.log("FULL payload:", JSON.stringify(payload, null, 2));

  try {
    const { data } = await petpujaClient.post("/save_order", payload);
    return data;
  } catch (error) {
    const errData = error.response?.data || error.message || error;
    const status = error.response?.status || 500;
    const e = new Error("Failed to place order with PetPooja");
    e.statusCode = status;
    e.details = errData;
    throw e;
  }
};


/**
 * Cancel PetPooja order (update_order_status)
 *
 * @param {object} params
 * @param {string} params.restID
 * @param {string} params.clientorderID - your own order id (e.g. A-1, A-6)
 * @param {string} [params.cancelReason] - default "Payment failed"
 * @returns {Promise<object>} PetPooja response data
 */
const cancelPetpujaOrder = async ({
  restID,
  clientorderID,
  cancelReason = "Payment failed"
}) => {
  const payload = {
    app_key: process.env.APP_KEY,
    app_secret: process.env.APP_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    restID,
    orderID: "",          // as per your note: pass it blank, will be deprecated
    clientorderID,
    cancelReason,
    status: "-1"          // -1 for cancelled
  };

  try {
    const { data } = await petpujaClient.post(
      "/update_order_status",
      payload
    );
    console.log("BRUNO CHECK – PetPooja raw response:", data);
    console.log("🧾 PetPooja cancel response:", data);

    if (
      !data ||
      data.success === false ||
      data.success === "0" ||
      data.status === "failure"
    ) {
      const err = new Error("PetPooja cancellation rejected");
      err.details = data;
      throw err;
    }

    return data;

  } catch (error) {
    const errData = error.response?.data || error.message || error;
    const status = error.response?.status || 500;
    const e = new Error("Failed to cancel order in PetPooja");
    e.statusCode = status;
    e.details = errData;
    throw e;
  }
};

const sendRiderDetailsToPetPuja = async (riderInfo) => {
  console.log("riderInfo::", riderInfo)
  try {
    // "rider-assigned/rider-arrived/pickedup/delivered"
    const payload = {
      app_key: process.env.APP_KEY,
      app_secret: process.env.APP_SECRET,
      access_token: process.env.ACCESS_TOKEN,
      "order_id": riderInfo?.data?.orderId,
      "outlet_id": "89",
      "status": riderStatusPetpujaStatusMapping("ALLOTTED"),
      "rider_data": {
        "rider_name": riderInfo.data.rider_name,
        "rider_phone_number": riderInfo.data.rider_contact
      },
      "external_order_id": ""   // pass this blank
    }
    console.log("update rider status to petpuja:::", payload);
    try {
      const { data } = await post(
        "https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/rider_status_update",
        payload,
      );
      return {
        success: true,
        message: "Rider status updated to petpuja",
        data
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: "Unable to update rider status petpuja"
      }
    }

  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
}

const riderStatusPetpujaStatusMapping = (riderStatus) =>{
  const riderStatusConst = riderStatusConfig();
    if(riderStatusConst.ALLOTTED === riderStatus) return "rider-assigned";
    if(riderStatusConst.ARRIVED === riderStatus) return  "rider-arrived";
    if(riderStatusConst.DISPATCHED === riderStatus) return "pickedup";
    if(riderStatusConst.DELIVERED === riderStatus) return "delivered";
    if(riderStatusConst.CANCELLED === riderStatus) return -1;
    return "";
}

module.exports = {
  placeOrderWithPetpuja,
  cancelPetpujaOrder,
  sendRiderDetailsToPetPuja
};
