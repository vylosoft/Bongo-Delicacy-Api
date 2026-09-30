const axios = require("axios");
const { FLASH_BASE_URL } = require("../../config/env");
const supabase = require("../../config/db");
const { sendRiderDetailsToPetPuja } = require("./petpujaHelper");
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
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
      }
    );

    console.log("🌍 Google Status:", response.data.status);

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

    if (nearestPoint) {
      console.log("✅ Google Selected:", nearestPoint.name);
      return nearestPoint;
    }

    throw new Error("No valid Google result");
  } catch (err) {
    console.warn("⚠️ Google failed, using fallback:", err.message);

    let minDistance = Infinity;
    let nearestPoint = null;

    points.forEach((point) => {
      const dist = getDistance(
        restaurantLat,
        restaurantLng,
        point.lat,
        point.lng
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = point;
      }
    });

    console.log("🧭 Fallback Selected:", nearestPoint.name);
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
const checkServiceability = async (pickupLat, pickupLong, dropLat, dropLong) => {
  try {
    console.log("📍 Pickup:", pickupLat, pickupLong);
    console.log("📍 Drop:", dropLat, dropLong);

    if (
      !isValidCoordinate(pickupLat) ||
      !isValidCoordinate(pickupLong) ||
      !isValidCoordinate(dropLat) ||
      !isValidCoordinate(dropLong)
    ) {
      throw new Error("Invalid coordinates");
    }

    const point = await getNearestDeliveryPoint(pickupLat, pickupLong);

    console.log("🏬 Store Used:", String(point.store_id),);

    const flashClient = createFlashClient(String(point.access_token));
    // const flashClient = createFlashClient(STATIC_ACCESS_TOKEN);
    const payload = {
      store_id: String(point.store_id),
      // store_id: STATIC_STORE_ID,
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

    console.log("🚚 Flash Response:", data);

    return {
      success: true,
      serviceable: data?.serviceability || false,
      payouts: data?.payouts || null,
      store_used: String(point.store_id),
    };
  } catch (error) {
    console.error("❌ Serviceability error:", error.message);

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
    const point = await getNearestDeliveryPoint(
      parseFloat(data.pickup_details?.latitude ?? 0),
      parseFloat(data.pickup_details?.longitude ?? 0)
    );
    const storeId = String(point.store_id);
    const accessToken = String(point.access_token);
    console.log("🚀 Creating task for:", point.name);

    const payload = {
      storeId: storeId,
      order_details: {
        order_total: data.total_amount,
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
        state: data.pickup_details?.state ?? "Bangalore",
      },
      drop_details: {
        name: data.customer.name,
        contact_number: data.customer.phone,
        latitude: parseFloat(data.delivery_address.coordinates.lat),
        longitude: parseFloat(data.delivery_address.coordinates.lng),
        address: data.customer.address,
        city: data.customer.city,
        state: data.customer.state,
      },
      order_items: data.items.map((item) => ({
        id: item.id,
        name: item.name || item.itemname,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };

    const baseUrl = FLASH_BASE_URL;
    const url = `${baseUrl}/createTask`;

    console.log("🚨 RIDER BASE URL:", baseUrl);
    console.log("🚨 FULL RIDER URL:", url);

    if (!baseUrl) throw new Error("FLASH_BASE_URL is undefined");
    if (!baseUrl.startsWith("http")) throw new Error("FLASH_BASE_URL must start with http/https");

    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "access-token": accessToken,
      },
    });
    console.log("📤 Request Data:", payload);
    console.log("📦 Rider Response:", response.data);

    if (!response.data.status) {
      await supabase
        .from("orders")
        .update({
          delivery_message: {
            status: response.data.status,
            message: response.data.message,
            status_code: response.data.Status_code,
            taskId: response.data.taskId,
            vendor_order_id: response.data.vendor_order_id,
          },
        })
        .eq("id", data.id);

      console.log("💾 delivery_message saved for failed task, order:", data.id);

      return {
        success: false,
        error: response.data.message || response.data.msg,
      };
    }

    return {
      success: true,
      data: response.data,
      meta: {
        store_id: storeId,
        access_token: accessToken,
      },
    };
  } catch (error) {
    console.error("❌ Create task failed:", error.message);

    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Track Task Status
 */
const trackTaskStatus = async (taskId, storeId, accessToken) => {
  try {
    const response = await axios.post(
      `${FLASH_BASE_URL}/trackTaskStatus`,
      {
        storeId,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": accessToken,
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Track failed:", error.message);

    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Cancel Task
 */
const cancelDeliveryTask = async (taskId, storeId, accessToken) => {
  try {
    const response = await axios.post(
      `${FLASH_BASE_URL}/cancelTask`,
      {
        storeId,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": accessToken
        },
      }
    );

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    console.error("❌ Cancel failed:", error.message);

    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

/**
 * Track and Save Task Status
 */
const trackAndSaveTaskStatus = async (taskId, orderId, storeId, accessToken) => {
  try {
    const baseUrl = FLASH_BASE_URL.replace(/\/$/, "");
    const url = `${baseUrl}/trackTaskStatus`;

    console.log("📡 TRACK API URL:", url);
    console.log("📤 TRACK REQUEST PAYLOAD:", {
      storeId,
      taskId,
    });

    const response = await axios.post(
      url,
      {
        storeId,
        taskId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "access-token": accessToken,
        },
      }
    );

    console.log("📥 FULL TRACK RESPONSE:", JSON.stringify(response.data, null, 2));

    const riderData = response.data?.data;


    if (!riderData) {
      console.log("⚠️ No riderData received");
      return;
    }

    console.log("🚚 Rider Data Extracted:", riderData);

    const { data: order } = await supabase
      .from("orders")
      .select("delivery_info")
      .eq("id", orderId)
      .maybeSingle();

    const updatedDeliveryInfo = {
      ...order?.delivery_info,
      taskId: riderData.taskId,
      latitude: riderData.latitude,
      longitude: riderData.longitude,
      tracking_url: riderData.tracking_url,
      status_code: response.data?.status_code,
      lastSyncTime: riderData.lastSyncTime,
    };

    // only update if valid
    if (
      riderData?.rider_name &&
      riderData.rider_name !== "Not Provided"
    ) {
      updatedDeliveryInfo.rider_name = riderData.rider_name;
    }

    if (
      riderData?.rider_contact &&
      riderData.rider_contact !== "9999999999"
    ) {
      updatedDeliveryInfo.rider_contact = riderData.rider_contact;
    }
    console.log("💾 DATA BEING SAVED TO DB:", updatedDeliveryInfo);

    await supabase
      .from("orders")
      .update({ delivery_info: updatedDeliveryInfo })
      .eq("id", orderId);

    console.log("✅ Rider tracking info saved for order:", orderId);

    const riderPayload = {
      orderId,
      taskId: riderData.taskId,
    };

    // only include valid name
    if (
      riderData?.rider_name &&
      riderData.rider_name !== "Not Provided"
    ) {
      riderPayload.rider_name = riderData.rider_name;
    }

    // only include valid phone
    if (
      riderData?.rider_contact &&
      riderData.rider_contact !== "9999999999"
    ) {
      riderPayload.rider_contact = riderData.rider_contact;
    }

    const petpujaPayload = {
      status_code: response.data?.status_code,
      data: riderPayload,
    };

    console.log("📤 SENDING TO PETPOOJA:", petpujaPayload);

    await sendRiderDetailsToPetPuja(petpujaPayload);

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