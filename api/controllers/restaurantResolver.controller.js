const supabase = require("../../config/db");

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
    const { restaurant_id, lat, lng } = req.body;

    if (!restaurant_id || lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id, lat and lng are required",
      });
    }

    // 1️⃣ Fetch outlets
    const { data: outlets, error } = await supabase
      .from("outlet")
      .select(`
        id,
        resturent_id,
        lat,
        long,
        is_active,
        petpooja_outlet_id
      `)
      .eq("resturent_id", restaurant_id);

    if (error) throw error;

    if (!outlets?.length) {
      return res.status(404).json({
        success: false,
        message: "No outlets found",
      });
    }

    // 2️⃣ Calculate distance
    const outletsWithDistance = outlets
      .filter(o => o.lat != null && o.long != null)
      .map(o => ({
        ...o,
        distance: getDistanceKm(lat, lng, o.lat, o.long),
      }))
      .sort((a, b) => a.distance - b.distance);

    // Distance rules (adjust anytime)
    const NEAR_RADIUS = 3;      // same area
    const EXTENDED_RADIUS = 8;  // fallback area

    // 3️⃣ Active outlets nearby
    let selected = outletsWithDistance.filter(
      o => o.is_active && o.distance <= NEAR_RADIUS
    );

    // 4️⃣ If none nearby → expand radius
    if (selected.length === 0) {
      selected = outletsWithDistance.filter(
        o => o.is_active && o.distance <= EXTENDED_RADIUS
      );
    }

    // 5️⃣ If still none → include closest inactive
    if (selected.length === 0) {
      selected = outletsWithDistance.slice(0, 3);
    }

    // 6️⃣ Return multiple closest outlets
    return res.json({
      success: true,
      restaurant_id,
      outlets: selected.map(o => ({
        outlet_id: o.id,
        petpooja_outlet_id: o.petpooja_outlet_id,
        is_active: o.is_active,
        distance_km: Number(o.distance.toFixed(2)),
      })),
    });

  } catch (err) {
    console.error("resolveRestaurant error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};