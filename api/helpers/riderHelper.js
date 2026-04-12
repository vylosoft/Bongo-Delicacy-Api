const axios = require("axios");
const { FLASH_BASE_URL } = require("../../config/env");
const supabase = require("../../config/db");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// 🔒 TEMP STATIC CONFIG (DO NOT REMOVE)
const STATIC_STORE_ID = "89";
const STATIC_ACCESS_TOKEN = "grdgedhs";

/**
 * Normalize DB row
 */
const normalizePoint = (p) => ({
  lat: parseFloat(p["Latitude"]),
  lng: parseFloat(p["Longitude"]),
  store_id: p["Store ID"],
  access_token: p["Access Token"],
  name: p["Outlet Name"],
});

/**
 * Haversine fallback
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * Get nearest delivery point (Google + fallback)
 */
const getNearestDeliveryPoint = async (restaurantLat, restaurantLng) => {
  const { data, error } = await supabase.from("delivery_points").select("data");

  if (error) throw error;
  if (!data.length) throw new Error("No delivery points found");

  const points = data.map((row) => normalizePoint(row.data));

  try {
    const destinations = points.map((p) => `${p.lat},${p.lng}`).join("|");
    const origin = `${restaurantLat},${restaurantLng}`;

    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
      {
        params: {
          origins: origin,
          destinations,
          key: GOOGLE_API_KEY,
        },
      },
    );

    if (!response.data.rows || !response.data.rows.length) {
      throw new Error("Invalid Google response");
    }

    const elements = response.data.rows[0].elements;

    let minDistance = Infinity;
    let nearestPoint = null;

    elements.forEach((el, index) => {
      if (el.status === "OK") {
        const distance = el.distance.value;

        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = points[index];
        }
      }
    });

    if (nearestPoint) return nearestPoint;

    throw new Error("No valid Google result");
  } catch (err) {
    let minDistance = Infinity;
    let nearestPoint = null;

    points.forEach((point) => {
      const dist = getDistance(
        restaurantLat,
        restaurantLng,
        point.lat,
        point.lng,
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = point;
      }
    });

    return nearestPoint;
  }
};

/**
 * Dynamic Flash Client
 */
const createFlashClient = (accessToken) => {
  return axios.create({
    baseURL: FLASH_BASE_URL,
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
      "access-token": accessToken,
    },
  });
};

/**
 * Validate coordinates
 */
const isValidCoordinate = (value) => {
  const num = Number(value);
  return !isNaN(num) && num >= -180 && num <= 180;
};

/**
 * Check serviceability
 */
const checkServiceability = async (
  pickupLat,
  pickupLong,
  dropLat,
  dropLong,
) => {
  try {
    if (
      !isValidCoordinate(pickupLat) ||
      !isValidCoordinate(pickupLong) ||
      !isValidCoordinate(dropLat) ||
      !isValidCoordinate(dropLong)
    ) {
      throw new Error("Invalid coordinates");
    }

    // 🔒 TEMP STATIC USAGE (COMMENT ONLY, DO NOT REMOVE DYNAMIC)
    // const point = await getNearestDeliveryPoint(pickupLat, pickupLong);

    const flashClient = createFlashClient(STATIC_ACCESS_TOKEN);

    const payload = {
      store_id: String(STATIC_STORE_ID),
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
      serviceable: data?.serviceability || false,
      payouts: data?.payouts || null,
      store_used: STATIC_STORE_ID,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Create Delivery Task
 */
const createDeliveryTaskFromOrder = async (data) => {
  try {
    // 🔒 TEMP STATIC USAGE (COMMENT ONLY, DO NOT REMOVE DYNAMIC)
    // const point = await getNearestDeliveryPoint(...);

    const payload = {
      storeId: STATIC_STORE_ID,

      order_details: {
        order_total: data.subtotal,
        paid: "true",
        vendor_order_id: data.id,
        order_source: "app",
        customer_orderId: data.id,
      },

      pickup_details: {
        name: data.pickup_details?.name ?? "",
        contact_number: data.pickup_details?.contact_number ?? "",
        latitude: parseFloat(data.pickup_details?.latitude ?? 0),
        longitude: parseFloat(data.pickup_details?.longitude ?? 0),
        address: data.pickup_details?.address ?? "",
        city: data.pickup_details?.city ?? "Bangalore",
      },

      drop_details: {
        name: data.customer.name,
        contact_number: data.customer.phone,
        latitude: parseFloat(data.delivery_address.coordinates.lat),
        longitude: parseFloat(data.delivery_address.coordinates.lng),
        address: data.delivery_address.fullAddress,
        city: data.delivery_address.landmark,
      },

      order_items: data.items.map((item) => ({
        id: item.id,
        name: item.name || item.itemname,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),

      authentication: {
        delivery_otp: data.otp,
        rto_otp: data.otp,
      },
    };

   const baseUrl = process.env.FLASH_BASE_URL;
   const url = `${baseUrl}/createTask`;

   console.log("🚨 RIDER BASE URL:", baseUrl);
   console.log("🚨 FULL RIDER URL:", url);

   if (!baseUrl) {
     throw new Error("RIDER_API_URL is undefined");
   }

   if (!baseUrl.startsWith("http")) {
     throw new Error("RIDER_API_URL must start with http/https");
   }

   const response = await axios.post(url, payload, {
     headers: {
       "Content-Type": "application/json",
       "access-token": STATIC_ACCESS_TOKEN,
     },
   });

    if (!response.data.status) {
      return {
        success: false,
        error: response.data.msg,
      };
    }

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Track Task Status
 */
const trackTaskStatus = async (taskId) => {
  try {
    const response = await axios.post(
      `${process.env.FLASH_BASE_URL}/trackTaskStatus`,
      {
        storeId: STATIC_STORE_ID,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": STATIC_ACCESS_TOKEN,
        },
      },
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Cancel Task
 */
const cancelDeliveryTask = async (taskId) => {
  try {
    const response = await axios.post(
      `${process.env.FLASH_BASE_URL}/cancelTask`,
      {
        storeId: STATIC_STORE_ID,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": STATIC_ACCESS_TOKEN,
        },
      },
    );

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
const trackAndSaveTaskStatus = async (taskId, orderId) => {
  try {
    const baseUrl = process.env.FLASH_BASE_URL.replace(/\/$/, "");
    const response = await axios.post(
      `${baseUrl}/trackTaskStatus`,
      {
        storeId: STATIC_STORE_ID,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": STATIC_ACCESS_TOKEN,
        },
      },
    );

    const riderData = response.data?.data;
    if (!riderData) return;

    const { data: order } = await supabase
      .from("orders")
      .select("delivery_info")
      .eq("id", orderId)
      .maybeSingle();

    const updatedDeliveryInfo = {
      ...order?.delivery_info,
      taskId: riderData.taskId,
      rider_name: riderData.rider_name,
      rider_contact: riderData.rider_contact,
      latitude: riderData.latitude,
      longitude: riderData.longitude,
      tracking_url: riderData.tracking_url,
      status_code: response.data?.status_code,
      lastSyncTime: riderData.lastSyncTime,
    };

    await supabase
      .from("orders")
      .update({ delivery_info: updatedDeliveryInfo })
      .eq("id", orderId);

    console.log("✅ Rider tracking info saved for order:", orderId);
  } catch (err) {
    console.error("❌ trackAndSaveTaskStatus failed:", err.message);
  }
};
module.exports = {
  checkServiceability,
  createDeliveryTaskFromOrder,
  trackTaskStatus,
  cancelDeliveryTask,
  trackAndSaveTaskStatus,
};
