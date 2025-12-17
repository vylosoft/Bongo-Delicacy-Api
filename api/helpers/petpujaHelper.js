// helpers/petpujaHelper.js
const axios = require("axios");
const env = require("../../config/env");

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

  try {
    const { data } = await petpujaClient.post("/save_order", payload);
    // You can add extra checks here based on PetPooja's success flag
    return data;
  } catch (error) {
    // normalize error
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

module.exports = {
  placeOrderWithPetpuja,
  cancelPetpujaOrder
};
