const axios = require("axios");

const RIDER_API_URL = "https://riderapi-staging.uengage.in";
const STORE_ID = "89";
const ACCESS_TOKEN = "grdgedhs";

/**
 * Check serviceability for delivery
 * NOTE: Currently not working - commented out for now
 */
const checkServiceability = async (pickupLat, pickupLong, dropLat, dropLong) => {
  // try {
  //   const response = await axios.post(
  //     `${RIDER_API_URL}/getServiceability`,
  //     {
  //       store_id: STORE_ID,
  //       pickupDetails: {
  //         latitude: pickupLat.toString(),
  //         longitude: pickupLong.toString(),
  //       },
  //       dropDetails: {
  //         latitude: dropLat.toString(),
  //         longitude: dropLong.toString(),
  //       },
  //     },
  //     {
  //       headers: {
  //         "Content-Type": "application/json",
  //         "access-token": ACCESS_TOKEN,
  //       },
  //     }
  //   );

  //   return {
  //     success: response.data.status === "200",
  //     serviceable: response.data.serviceability?.riderServiceAble && 
  //                  response.data.serviceability?.locationServiceAble,
  //     payouts: response.data.payouts,
  //   };
  // } catch (error) {
  //   console.error("Serviceability check failed:", error.response?.data || error.message);
  //   return {
  //     success: false,
  //     serviceable: false,
  //     error: error.response?.data || error.message,
  //   };
  // }

  // Temporary: Return serviceable by default since API is not working
  console.warn("Serviceability check is currently disabled - returning default serviceable: true");
  return {
    success: true,
    serviceable: true,
    payouts: {
      total: 0,
      price: 0,
      tax: 0,
      message: "Serviceability check temporarily disabled"
    },
  };
};

/**
 * Extract order details and create delivery task
 * This extracts all info from orderinfo object
 */
const createDeliveryTaskFromOrder = async (orderinfo, clientorderID, userId = null) => {
  try {
    // Extract order details
    const orderDetails = orderinfo.OrderInfo?.Order?.details || {};
    const restaurantDetails = orderinfo.OrderInfo?.Restaurant?.details || {};
    const orderItems = orderinfo.OrderItem?.details || [];

    // Calculate order total
    const orderTotal = Number(orderDetails.total || orderDetails.amount || 0);
    
    // Extract pickup details (Restaurant)
    const pickupDetails = {
      name: restaurantDetails.restName || restaurantDetails.name || "Restaurant",
      contactNumber: restaurantDetails.contactNumber || 
                     restaurantDetails.phone || 
                     restaurantDetails.mobile || 
                     "0000000000",
      latitude: restaurantDetails.latitude || 
                restaurantDetails.lat || 
                "0",
      longitude: restaurantDetails.longitude || 
                 restaurantDetails.long || 
                 restaurantDetails.lng || 
                 "0",
      address: restaurantDetails.address || 
               restaurantDetails.fullAddress || 
               "",
      city: restaurantDetails.city || 
            restaurantDetails.cityName || 
            "",
    };

    // Extract drop details (Customer)
    const dropDetails = {
      name: orderDetails.customerName || 
            orderDetails.customer_name || 
            orderDetails.name || 
            "Customer",
      contactNumber: orderDetails.customerPhone || 
                     orderDetails.customer_phone || 
                     orderDetails.phone || 
                     orderDetails.mobile || 
                     "0000000000",
      latitude: orderDetails.deliveryLatitude || 
                orderDetails.delivery_latitude || 
                orderDetails.latitude || 
                orderDetails.lat || 
                "0",
      longitude: orderDetails.deliveryLongitude || 
                 orderDetails.delivery_longitude || 
                 orderDetails.longitude || 
                 orderDetails.long || 
                 orderDetails.lng || 
                 "0",
      address: orderDetails.deliveryAddress || 
               orderDetails.delivery_address || 
               orderDetails.address || 
               orderDetails.fullAddress || 
               "",
      city: orderDetails.city || 
            orderDetails.deliveryCity || 
            orderDetails.cityName || 
            "",
    };

    // Format order items
    const formattedItems = orderItems.map((item, index) => ({
      id: (item.itemId || item.id || item.item_id || index + 1).toString(),
      name: item.itemName || item.name || item.item_name || "Item",
      quantity: item.quantity || item.qty || 1,
      price: item.price || item.amount || item.itemPrice || 0,
    }));

    // OPTIONAL: Check serviceability before creating task (currently disabled)
    // const serviceCheck = await checkServiceability(
    //   pickupDetails.latitude,
    //   pickupDetails.longitude,
    //   dropDetails.latitude,
    //   dropDetails.longitude
    // );
    // if (!serviceCheck.serviceable) {
    //   return {
    //     success: false,
    //     error: "Delivery not serviceable for this location",
    //   };
    // }

    // Build payload for uEngage
    const payload = {
      storeId: STORE_ID,
      order_details: {
        order_total: orderTotal,
        paid: "false", // Will be updated after payment
        vendor_order_id: clientorderID,
        order_source: "app",
        customer_orderId: clientorderID,
      },
      pickup_details: {
        name: pickupDetails.name,
        contact_number: pickupDetails.contactNumber,
        latitude: parseFloat(pickupDetails.latitude),
        longitude: parseFloat(pickupDetails.longitude),
        address: pickupDetails.address,
        city: pickupDetails.city,
      },
      drop_details: {
        name: dropDetails.name,
        contact_number: dropDetails.contactNumber,
        latitude: parseFloat(dropDetails.latitude),
        longitude: parseFloat(dropDetails.longitude),
        address: dropDetails.address,
        city: dropDetails.city,
      },
      order_items: formattedItems,
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

    return {
      success: response.data.status === true,
      taskId: response.data.taskId,
      vendorOrderId: response.data.vendor_order_id,
      message: response.data.message,
      statusCode: response.data.Status_code,
    };
  } catch (error) {
    console.error("Create task failed:", error.response?.data || error.message);
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
      success: response.data.status === true,
      statusCode: response.data.status_code,
      message: response.data.message,
      data: response.data.data,
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