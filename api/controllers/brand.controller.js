const supabase = require("../../config/db");
const axios = require("axios");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ==========================
// ✅ ADD BRAND
// ==========================
const addBrand = async (req, res) => {
  try {
    const payload = {
      ...req.body
    };

    const { data, error } = await supabase
      .from("brands")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Brand creation failed",
        status: 400
      });
    }

    return res.success({
      data,
      message: "Brand created successfully"
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const getAllBrands = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await supabase
      .from("brands")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("id", { ascending: false });

    if (error) {
      console.log(error);
      return res.error({
        message: "Error fetching brands",
        status: 500
      });
    }

    return res.success({
      data: { result: data, count }
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const getBrandDetails = async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Brand not found",
        status: 404
      });
    }

    return res.success({ data });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const updateBrand = async (req, res) => {
  try {
    const id = req.params.id;

    const payload = {
      ...req.body
    };

    const { data, error } = await supabase
      .from("brands")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Update failed",
        status: 400
      });
    }

    return res.success({
      data,
      message: "Brand updated successfully"
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const uploadBrandImage = async (req, res) => {
  try {
    const { id, type } = req.body; 
    // type = logo | hero | about

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();

    const filePath = `brands/${id}/${type}-${Date.now()}.${ext}`;

    const BUCKET = "restaurant-images";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.log(uploadError);
      return res.error({
        message: uploadError.message,
        status: 400
      });
    }

    // ✅ Update DB column
    const updatePayload = {};
    if (type === "logo") updatePayload.logo = filePath;
    if (type === "hero") updatePayload.hero_image = filePath;
    if (type === "about") updatePayload.about_image = filePath;

    const { error: dbError } = await supabase
      .from("brands")
      .update(updatePayload)
      .eq("id", id);

    if (dbError) {
      console.log(dbError);
    }

    // ✅ Public URL
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return res.success({
      data: data.publicUrl,
      path: filePath,
      message: "Image uploaded successfully"
    });

  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// ==========================
// 🚗 GOOGLE ROAD DISTANCE
// ==========================
const getRoadDistanceKm = async (lat1, lng1, lat2, lng2) => {
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
      {
        params: {
          origins: `${lat1},${lng1}`,
          destinations: `${lat2},${lng2}`,
          key: GOOGLE_API_KEY,
        },
      }
    );

    const element = res.data?.rows?.[0]?.elements?.[0];

    if (!element || element.status !== "OK") return null;

    return {
      distance: element.distance.value / 1000, // km
      duration: element.duration.value / 60,   // minutes
    };
  } catch (err) {
    console.log("Google Distance Error:", err.message);
    return null;
  }
};

// ==========================
// 🔧 OUTLET OPEN CHECK
// ==========================
const isOutletOpen = (o) => {
  if (o.is_active) return true;

  if (o.outlet_open_date_time) {
    const openTime = new Date(o.outlet_open_date_time).getTime();
    return Date.now() >= openTime;
  }

  return false;
};

// ==========================
// ✅ MAIN API
// ==========================
const getBrandsWithOutlet = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasLocation = !isNaN(lat) && !isNaN(lng);

    // ==========================
    // 1. FETCH BRANDS
    // ==========================
    const { data: brands, error: brandError } = await supabase
      .from("brands")
      .select("*");

    if (brandError) {
      return res.error({
        message: "Failed to fetch brands",
        status: 500,
      });
    }

    // ==========================
    // 2. FETCH OUTLETS
    // ==========================
    const { data: outlets, error: outletError } = await supabase
      .from("outlet")
      .select("*")
      .not("brand_id", "is", null);

    if (outletError) {
      return res.error({
        message: "Failed to fetch outlets",
        status: 500,
      });
    }

    // ==========================
    // 3. GROUP OUTLETS
    // ==========================
    const brandMap = {};

    await Promise.all(
      outlets.map(async (o) => {
        if (!brandMap[o.brand_id]) {
          brandMap[o.brand_id] = [];
        }

        let distance = 9999;
        let duration = null;

        if (hasLocation && o.lat != null && o.long != null) {
          const outletLat = Number(o.lat);
          const outletLng = Number(o.long);

          // 🔹 Haversine first
          const haversine = getDistanceKm(
            lat,
            lng,
            outletLat,
            outletLng
          );

          // 🔥 Optimize → call Google only if nearby (<10km)
          if (haversine < 10) {
            const roadData = await getRoadDistanceKm(
              lat,
              lng,
              outletLat,
              outletLng
            );

            distance = roadData?.distance ?? haversine;
            duration = roadData?.duration ?? null;
          } else {
            distance = haversine;
          }
        }

        brandMap[o.brand_id].push({
          ...o,
          distance,
          duration,
          is_open: isOutletOpen(o),
        });
      })
    );

    // ==========================
    // 4. PROCESS BRANDS
    // ==========================
    const result = brands.map((brand) => {
      const brandOutlets = brandMap[brand.id] || [];

      if (brandOutlets.length === 0) {
        return {
          ...brand,
          is_closed: true,
          selected_outlet: null,
        };
      }

      // 🔹 sort by distance
      brandOutlets.sort((a, b) => a.distance - b.distance);

      // 🔹 find first OPEN outlet
      const openOutlet = brandOutlets.find((o) => o.is_open);

      // 🔹 fallback → nearest
      const selected = openOutlet || brandOutlets[0];

      return {
        ...brand,
        is_closed: !openOutlet,

        selected_outlet: {
          outlet_id: selected.id,
          petpooja_outlet_id: selected.petpooja_outlet_id,
          resturent_id: selected.resturent_id,

          lat: selected.lat,
          long: selected.long,
          address: selected.address,
          city: selected.city,

          logo: selected.logo,
          hero_image: selected.hero_image,

          distance_km: Number(selected.distance.toFixed(2)),
          eta_min: selected.duration
            ? Math.round(selected.duration)
            : null,

          is_open: selected.is_open,
        },
      };
    });

    // ==========================
    // ✅ RESPONSE
    // ==========================
    return res.success({
      data: result,
    });

  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500,
    });
  }
};

module.exports = {
  addBrand,
  getAllBrands,
  getBrandDetails,
  updateBrand,
  uploadBrandImage,
  getBrandsWithOutlet
};