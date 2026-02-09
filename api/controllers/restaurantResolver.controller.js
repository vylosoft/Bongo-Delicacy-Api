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
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

exports.resolveRestaurant = async (req, res) => {
  try {
    const { restaurant_id, lat, lng } = req.body;

    // 1️⃣ Validate input
    if (!restaurant_id || lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id, lat and lng are required",
      });
    }

    // 2️⃣ Fetch outlets for the restaurant
    const { data: outlets, error } = await supabase
      .from("outlet")
      .select(
        `
        id,
        resturent_id,
        lat,
        long,
        is_active,
        petpooja_outlet_id
      `,
      )
      .eq("resturent_id", restaurant_id);

    if (error) throw error;

    if (!outlets || outlets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No outlets found for this restaurant",
      });
    }

    // 3️⃣ Filter active outlets with valid coordinates
    const activeOutlets = outlets.filter(
      (o) => o.is_active === true && o.lat != null && o.long != null,
    );

    if (activeOutlets.length === 0) {
      return res.json({
        success: false,
        message: "All outlets are currently inactive",
      });
    }

    // 4️⃣ Find nearest outlet
    const nearest = activeOutlets
      .map((o) => ({
        ...o,
        distance: getDistanceKm(lat, lng, o.lat, o.long),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    // 5️⃣ Return outlet IDs + distance
    return res.json({
      success: true,
      resturent_id: nearest.resturent_id, // internal outlet UUID
      petpooja_outlet_id: nearest.petpooja_outlet_id, // PetPooja outlet ID
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
