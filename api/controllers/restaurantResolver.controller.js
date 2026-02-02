const { supabase } = require("../../utils/supabaseClient");

/**
 * Haversine distance (KM)
 */
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

exports.resolveRestaurant = async (req, res) => {
  try {
    const { restaurant_name, lat, lng } = req.body;

    if (!restaurant_name || lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: "restaurant_name, lat and lng are required",
      });
    }

    // 1️⃣ Fetch all outlets for this restaurant name
    const { data: outlets, error } = await supabase
      .from("petpooja_menu_cache")
      .select("rest_id, restaurant_name, latitude, longitude, isclosed")
      .eq("restaurant_name", restaurant_name);

    if (error) throw error;

    if (!outlets || outlets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No outlets found for this restaurant",
      });
    }

    // 2️⃣ Keep only OPEN outlets with valid coordinates
    const openOutlets = outlets.filter(
      (o) =>
        o.isclosed === false &&
        o.latitude != null &&
        o.longitude != null
    );

    if (openOutlets.length === 0) {
      return res.json({
        success: false,
        message: "All outlets are currently closed",
      });
    }

    // 3️⃣ Calculate distance & sort
    const nearest = openOutlets
      .map((o) => ({
        ...o,
        distance: getDistanceKm(
          lat,
          lng,
          o.latitude,
          o.longitude
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    // 4️⃣ Return nearest outlet
    return res.json({
      success: true,
      rest_id: nearest.rest_id,
      distance_km: Number(nearest.distance.toFixed(2)),
    });
  } catch (err) {
    console.error("resolveRestaurant error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
