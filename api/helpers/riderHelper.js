const axios = require("axios");
const { FLASH_ACCESS_TOKEN, FLASH_STORE_ID, FLASH_BASE_URL } = require("../../config/env");

if (!FLASH_ACCESS_TOKEN || !FLASH_STORE_ID) {
  throw new Error("Missing FLASH_ACCESS_TOKEN or FLASH_STORE_ID in environment variables");
}

// Create reusable axios instance
const flashClient = axios.create({
  baseURL: FLASH_BASE_URL,
  timeout: 10000, // 10 seconds timeout
  headers: {
    "Content-Type": "application/json",
    "access-token": FLASH_ACCESS_TOKEN,
  },
});

/**
 * Validate coordinates
 */
const isValidCoordinate = (value) => {
  const num = Number(value);
  return !isNaN(num) && num >= -180 && num <= 180;
};

/**
 * Check serviceability for delivery
 */
const checkServiceability = async (pickupLat, pickupLong, dropLat, dropLong) => {
  try {
    // Input validation
    if (
      !isValidCoordinate(pickupLat) ||
      !isValidCoordinate(pickupLong) ||
      !isValidCoordinate(dropLat) ||
      !isValidCoordinate(dropLong)
    ) {
      throw new Error("Invalid latitude or longitude values");
    }

    const payload = {
      store_id: String(FLASH_STORE_ID),
      pickupDetails: {
        latitude: String(pickupLat),
        longitude: String(pickupLong),
      },
      dropDetails: {
        latitude: String(dropLat),
        longitude: String(dropLong),
      },
    };

    const { data } = await flashClient.post("/getServiceability", payload);

    return {
      success: true,
      serviceable: data?.serviceability || null,
      payouts: data?.payouts || null,
      raw: data, // optional, helpful for debugging
    };
  } catch (error) {
    const errorData = error.response?.data || error.message;

    console.error("Flash serviceability error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });

    return {
      success: false,
      serviceable: false,
      error: errorData,
    };
  }
};


/**
 * Extract order details and create delivery task
 * This extracts all info from orderinfo object
 */
// const createDeliveryTaskFromOrder = async (data) => {
//   try {
//     // Build payload for uEngage
//     const payload = {
//       storeId:process.env.STORE_ID,
//       order_details: {
//         order_total: data.subtotal,
//         paid: "true", // Will be updated after payment
//         vendor_order_id: data.id,
//         order_source: "app",
//         customer_orderId: data.id,
//       },
//       pickup_details: {
//         name: data.resturent_name,
//         contact_number: data.resturent_number,
//         latitude: parseFloat(data.resturent_lat),
//         longitude: parseFloat(data.resturent_lang),
//         address: data.resturent_address,
//         city: data.resturent_city,
//       },
//       drop_details: {
//         name: data.customer.name,
//         contact_number: data.customer.phone,
//         latitude: parseFloat(data.delivery_address.coordinates.lat),
//         longitude: parseFloat(data.delivery_address.coordinates.lng),
//         address: data.delivery_address.fullAddress,
//         city: data.delivery_address.landmark,
//       },
//       order_items: data.items.map(item => ({
//         id: item.id,                // or item.itemid if that’s your real ID
//         name: item.name || item.itemname,
//         quantity: Number(item.quantity),
//         price: Number(item.price)
//       })),
//      authentication: {
//         delivery_otp: data.otp,
//         rto_otp: data.otp
//       }
//     };

//     console.log("Creating rider task with payload:", JSON.stringify(payload, null, 2));

//     const response = await axios.post(
//       `${process.env.RIDER_API_URL}/createTask`,
//       payload,
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "access-token": process.env.ACCESS_TOKEN,
//         },
//       }
//     );
//     console.log("Create task response:", response.data);
//     if(!response.data.status){
//        return {
//       success: false,
//       error: response.data.msg
//     };
//     }
//     return {
//       success: true,
//       data: response.data,

//     };
//   } catch (error) {
//     console.error("Create task failed:", error);
//     return {
//       success: false,
//       error: error.response?.data || error.message,
//     };
//   }
// };

// /**
//  * Track task status
//  */
// const trackTaskStatus = async (taskId) => {
//   try {
//     const response = await axios.post(
//       `${RIDER_API_URL}/trackTaskStatus`,
//       {
//         storeId: STORE_ID,
//         taskId: taskId,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "access-token": ACCESS_TOKEN,
//         },
//       }
//     );

//     return {
//       success: true,
//       message: response.data.message,
//       data: response.data,
//     };
//   } catch (error) {
//     console.error("Track task failed:", error.response?.data || error.message);
//     return {
//       success: false,
//       error: error.response?.data || error.message,
//     };
//   }
// };

// /**
//  * Cancel delivery task
//  */
// const cancelDeliveryTask = async (taskId) => {
//   try {
//     const response = await axios.post(
//       `${RIDER_API_URL}/cancelTask`,
//       {
//         storeId: STORE_ID,
//         taskId: taskId,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "access-token": ACCESS_TOKEN,
//         },
//       }
//     );

//     return {
//       success: true,
//       message: response.data.message,
//     };
//   } catch (error) {
//     console.error("Cancel task failed:", error.response?.data || error.message);
//     return {
//       success: false,
//       error: error.response?.data || error.message,
//     };
//   }
// };

module.exports = {
  checkServiceability,
  // createDeliveryTaskFromOrder,
  // trackTaskStatus,
  // cancelDeliveryTask,
};