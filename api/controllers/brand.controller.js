const supabase = require("../../config/db");
const axios = require("axios");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ==========================
// ✅ ADD BRAND
// ==========================
const addBrand = async (req, res) => {
  try {
    const payload = { ...req.body };

    const { data, error } = await supabase
      .from("brands")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({ message: "Brand creation failed", status: 400 });
    }

    return res.success({ data, message: "Brand created successfully" });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

const getAllBrands = async (req, res) => {
  try {
    const page    = Number(req.query.page)     || 1;
    const perPage = Number(req.query.per_page) || 20;
    const from    = (page - 1) * perPage;
    const to      = from + perPage - 1;

    const { data, error, count } = await supabase
      .from("brands")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("id", { ascending: false });

    if (error) {
      console.log(error);
      return res.error({ message: "Error fetching brands", status: 500 });
    }

    return res.success({ data: { result: data, count } });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
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
      return res.error({ message: "Brand not found", status: 404 });
    }

    return res.success({ data });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

const updateBrand = async (req, res) => {
  try {
    const id      = req.params.id;
    const payload = { ...req.body };

    const { data, error } = await supabase
      .from("brands")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({ message: "Update failed", status: 400 });
    }

    return res.success({ data, message: "Brand updated successfully" });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

const uploadBrandImage = async (req, res) => {
  try {
    const { id, type } = req.body;
    const ext      = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const filePath = `brands/${id}/${type}-${Date.now()}.${ext}`;
    const BUCKET   = "restaurant-images";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) {
      console.log(uploadError);
      return res.error({ message: uploadError.message, status: 400 });
    }

    const updatePayload = {};
    if (type === "logo")  updatePayload.logo        = filePath;
    if (type === "hero")  updatePayload.hero_image  = filePath;
    if (type === "about") updatePayload.about_image = filePath;

    const { error: dbError } = await supabase.from("brands").update(updatePayload).eq("id", id);
    if (dbError) console.log(dbError);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return res.success({ data: data.publicUrl, path: filePath, message: "Image uploaded successfully" });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// 📐 HAVERSINE DISTANCE
// ==========================
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// ==========================
// 🚗 GOOGLE ROAD DISTANCE
// ==========================
const getRoadDistanceKm = async (lat1, lng1, lat2, lng2) => {
  try {
    const res = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: { origins: `${lat1},${lng1}`, destinations: `${lat2},${lng2}`, key: GOOGLE_API_KEY },
    });
    const element = res.data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;
    return { distance: element.distance.value / 1000, duration: element.duration.value / 60 };
  } catch (err) {
    console.log("Google Distance Error:", err.message);
    return null;
  }
};

// ==========================
// 🕐 OUTLET OPEN CHECK
//    An outlet is open only if BOTH are true:
//      1. is_active is TRUE  (this is driven by Petpooja — they can flip an
//         outlet offline/closed on their end at any time, independent of
//         the configured weekly schedule)
//      2. The current time falls inside an open slot in outlet_timings
//         for today (and that slot isn't itself marked is_closed)
//    If is_active is false, the outlet is closed regardless of timings.
//    If there are no outlet_timings rows at all for this outlet yet,
//    we fall back to is_active alone (no schedule configured = trust Petpooja).
// ==========================
const isOpenNow = (timingRows, isActive) => {
  // Petpooja says this outlet is offline/closed — that's final, schedule doesn't matter.
  if (!isActive) return false;

  // No schedule configured yet — trust Petpooja's is_active as-is.
  if (!timingRows || timingRows.length === 0) return true;

  // Current time in IST (UTC+5:30)
  const now       = new Date();
  const istOffset = 5 * 60 + 30;
  const istMin    = (now.getUTCHours() * 60 + now.getUTCMinutes() + istOffset) % (24 * 60);
  const todayDay  = new Date(now.getTime() + istOffset * 60000).getUTCDay(); // 0=Sun … 6=Sat

  const toMin = (t) => {
    if (!t) return 0;
    const [h, m] = String(t).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Coerce day_of_week to a number — Postgres/PostgREST can return it as a
  // string depending on column type, and a strict === comparison against
  // todayDay (a number) would silently fail every time.
  const todaySlots = timingRows.filter(
    (r) => Number(r.day_of_week) === todayDay && r.is_closed !== true && r.is_closed !== "true"
  );

  for (const slot of todaySlots) {
    const open  = toMin(slot.open_time);
    const close = toMin(slot.close_time);
    // overnight slot e.g. 22:00 → 02:00 next day
    if (close < open) {
      if (istMin >= open || istMin < close) return true;
    } else {
      if (istMin >= open && istMin < close) return true;
    }
  }

  return false;
};

// ==========================
// ✅ MAIN: GET BRANDS WITH BEST OUTLET
// ==========================
const getBrandsWithOutlet = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasLocation = !isNaN(lat) && !isNaN(lng);

    // 1. Fetch all brands
    const { data: brands, error: brandError } = await supabase
      .from("brands")
      .select("*");

    if (brandError) {
      return res.error({ message: "Failed to fetch brands", status: 500 });
    }

    // 2. Fetch outlets, and their timings, as two SEPARATE queries.
    //    (Previously this used a nested select — outlet.select(`*, outlet_timings(...)`) —
    //    which relies on PostgREST auto-detecting the outlet_timings.outlet_id FK.
    //    If that relationship isn't registered correctly, the embed can come back
    //    empty/null per row WITHOUT throwing an error, silently making isOpenNow()
    //    fall back to is_active for every outlet — which is why brands were showing
    //    OPEN even when every outlet's timings said they should be closed.)
    const { data: outlets, error: outletError } = await supabase
      .from("outlet")
      .select("*")
      .not("brand_id", "is", null);

    if (outletError) {
      return res.error({ message: "Failed to fetch outlets", status: 500 });
    }

    const outletIds = (outlets || []).map((o) => o.id);

    let timingRowsRaw = [];
    if (outletIds.length > 0) {
      const { data: timingsData, error: timingsError } = await supabase
        .from("outlet_timings")
        .select("outlet_id, day_of_week, open_time, close_time, is_closed")
        .in("outlet_id", outletIds);

      if (timingsError) {
        console.log("Failed to fetch outlet_timings:", timingsError);
      } else {
        timingRowsRaw = timingsData || [];
      }
    }

    // Group timing rows by outlet_id in JS
    const timingsByOutlet = {};
    for (const row of timingRowsRaw) {
      if (!timingsByOutlet[row.outlet_id]) timingsByOutlet[row.outlet_id] = [];
      timingsByOutlet[row.outlet_id].push(row);
    }

    // 3. Enrich outlets with distance + live open status
    const enriched = await Promise.all(
      (outlets || []).map(async (o) => {
        let distance = 9999;
        let duration = null;

        if (hasLocation && o.lat != null && o.long != null) {
          const outletLat = Number(o.lat);
          const outletLng = Number(o.long);
          const haversine = getDistanceKm(lat, lng, outletLat, outletLng);

          if (haversine < 10) {
            const roadData = await getRoadDistanceKm(lat, lng, outletLat, outletLng);
            distance = roadData?.distance ?? haversine;
            duration = roadData?.duration ?? null;
          } else {
            distance = haversine;
          }
        }

        const timingRows = timingsByOutlet[o.id];
        const open = isOpenNow(timingRows, o.is_active);

        // 🔍 TEMP DEBUG — remove once verified in production logs
        console.log(
          `[outlet ${o.id}] timings=${timingRows ? timingRows.length : 0} is_active=${o.is_active} -> is_open=${open}`
        );

        return {
          ...o,
          distance,
          duration,
          // ✅ is_open now driven by outlet_timings, not is_active
          is_open: open,
        };
      })
    );

    // 4. Group by brand and pick best outlet per brand
    const outletsByBrand = {};
    for (const o of enriched) {
      if (!outletsByBrand[o.brand_id]) outletsByBrand[o.brand_id] = [];
      outletsByBrand[o.brand_id].push(o);
    }

    const result = brands.map((brand) => {
      const brandOutlets = outletsByBrand[brand.id] || [];

      if (brandOutlets.length === 0) {
        return { ...brand, is_closed: true, selected_outlet: null };
      }

      // Sort: open first, then by distance
      brandOutlets.sort((a, b) => {
        if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
        return a.distance - b.distance;
      });

      const openOutlet = brandOutlets.find((o) => o.is_open);
      const selected   = openOutlet || brandOutlets[0]; // fallback to nearest if all closed

      // 🔍 TEMP DEBUG — remove once verified in production logs
      console.log(
        `[brand ${brand.id} "${brand.brand_name}"] outlets=${brandOutlets.length} openCount=${brandOutlets.filter(o => o.is_open).length} -> is_closed=${!openOutlet}`
      );

      return {
        ...brand,
        // ✅ brand card shows "Closed" when no outlet is currently open
        is_closed: !openOutlet,

        selected_outlet: {
          outlet_id:          selected.id,
          petpooja_outlet_id: selected.petpooja_outlet_id,
          resturent_id:       selected.resturent_id,
          brand_name:         brand.brand_name,
          lat:                selected.lat,
          long:               selected.long,
          address:            selected.address,
          city:               selected.city,
          contact:            selected.contact,
          distance_km:        Number(selected.distance.toFixed(2)),
          eta_min:            selected.duration ? Math.round(selected.duration) : null,
          is_open:            selected.is_open,
        },
      };
    });

    return res.success({ data: result });

  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

module.exports = {
  addBrand,
  getAllBrands,
  getBrandDetails,
  updateBrand,
  uploadBrandImage,
  getBrandsWithOutlet,
};