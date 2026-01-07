const axios = require("axios");

const RIDER_API_URL = "https://riderapi-staging.uengage.in";
const STORE_ID = "89";
const ACCESS_TOKEN = "grdgedhs";

/**
 * Check serviceability for delivery
 * NOTE: Currently not working - commented out for now
 */
const checkServiceability = async (pickupLat, pickupLong, dropLat, dropLong) => {
  try {
    const response = await axios.post(
      `${RIDER_API_URL}/getServiceability`,
      {
        store_id: STORE_ID,
        pickupDetails: {
          latitude: pickupLat.toString(),
          longitude: pickupLong.toString(),
        },
        dropDetails: {
          latitude: dropLat.toString(),
          longitude: dropLong.toString(),
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": ACCESS_TOKEN,
        },
      }
    );

    return {
      success: true,
      serviceable: response?.data?.serviceability || null,
      payouts: response?.data?.payouts || null,
    };
  } catch (error) {
    console.error("Serviceability check failed:", error.response?.data || error.message);
    return {
      success: false,
      serviceable: false,
      error: error.response?.data || error.message,
    };
  }


};

/**
 * Extract order details and create delivery task
 * This extracts all info from orderinfo object
 */
const createDeliveryTaskFromOrder = async (data) => {
  try {
    // Build payload for uEngage
    const payload = {
      storeId: STORE_ID,
      order_details: {
        order_total: data.subtotal,
        paid: "true", // Will be updated after payment
        vendor_order_id: data.id,
        order_source: "app",
        customer_orderId: data.id,
      },
      pickup_details: {
        name: data.resturent_name,
        contact_number: data.resturent_number,
        latitude: parseFloat(data.resturent_lat),
        longitude: parseFloat(data.resturent_lang),
        address: data.resturent_address,
        city: data.resturent_city,
      },
      drop_details: {
        name: data.customer.name,
        contact_number: data.customer.phone,
        latitude: parseFloat(data.delivery_address.coordinates.lat),
        longitude: parseFloat(data.delivery_address.coordinates.lng),
        address: data.delivery_address.fullAddress,
        city: data.delivery_address.landmark,
      },
      order_items: data.items.map(item => ({
        id: item.id,                // or item.itemid if that’s your real ID
        name: item.name || item.itemname,
        quantity: Number(item.quantity),
        price: Number(item.price)
      })),
     authentication: {
        delivery_otp: data.otp,
        rto_otp: data.otp
      }
    };

    console.log("Creating rider task with payload:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${RIDER_API_URL}/createTask`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": ACCESS_TOKEN,
        },
      }
    );
    console.log("Create task response:", response.data);
    if(!response.data.status){
       return {
      success: false,
      error: response.data.msg
    };
    }
    return {
      success: true,
      data: response.data,

    };
  } catch (error) {
    console.error("Create task failed:", error);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Track task status
 */
const trackTaskStatus = async (taskId) => {
  try {
    const response = await axios.post(
      `${RIDER_API_URL}/trackTaskStatus`,
      {
        storeId: STORE_ID,
        taskId: taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": ACCESS_TOKEN,
        },
      }
    );

    return {
      success: true,
      message: response.data.message,
      data: response.data,
    };
  } catch (error) {
    console.error("Track task failed:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Cancel delivery task
 */
const cancelDeliveryTask = async (taskId) => {
  try {
    const response = await axios.post(
      `${RIDER_API_URL}/cancelTask`,
      {
        storeId: STORE_ID,
        taskId: taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": ACCESS_TOKEN,
        },
      }
    );

    return {
      success: response.data.status === true,
      statusCode: response.data.status_code,
      message: response.data.message,
    };
  } catch (error) {
    console.error("Cancel task failed:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

module.exports = {
  checkServiceability,
  createDeliveryTaskFromOrder,
  trackTaskStatus,
  cancelDeliveryTask,
};