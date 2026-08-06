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
// 🕐 IST TIME HELPERS
// ==========================
const IST_OFFSET_MIN = 5 * 60 + 30;

/** Current time expressed as IST wall-clock: { day (0=Sun..6=Sat), minutes since midnight } */
const getNowIST = () => {
  const now = new Date();
  const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % (24 * 60);
  const istDay = new Date(now.getTime() + IST_OFFSET_MIN * 60000).getUTCDay();
  return { now, istDay, istMin };
};

const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Build a real UTC ISO datetime for "dayOffset days from today (IST) at minutesSinceMidnight (IST)" */
const istToUTCISO = (dayOffset, minutesSinceMidnight) => {
  const { now } = getNowIST();
  const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  const target = new Date(Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate() + dayOffset,
    Math.floor(minutesSinceMidnight / 60),
    minutesSinceMidnight % 60,
    0
  ));
  return new Date(target.getTime() - IST_OFFSET_MIN * 60000).toISOString();
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
  if (!isActive) return false;
  if (!timingRows || timingRows.length === 0) return true;

  const { istDay, istMin } = getNowIST();

  const todaySlots = timingRows.filter(
    (r) => Number(r.day_of_week) === istDay && r.is_closed !== true && r.is_closed !== "true"
  );

  for (const slot of todaySlots) {
    const open  = toMin(slot.open_time);
    const close = toMin(slot.close_time);
    if (close < open) {
      if (istMin >= open || istMin < close) return true;
    } else {
      if (istMin >= open && istMin < close) return true;
    }
  }

  return false;
};

// ==========================
// 🕐 NEXT OPEN DATETIME
//    Only called when isOpenNow() is false. Figures out the next real
//    moment (as a UTC ISO string) the outlet will open, so the frontend
//    can show "Today 10 PM" / "Tomorrow 11 AM" / "22 Oct 11:00 AM" via
//    its existing isStillClosedUntil()/formatISTTime() helpers.
//
//    Priority:
//      1. If Petpooja has it manually closed (is_active=false) AND an
//         explicit outlet_open_date_time is set in the future, that wins —
//         it's an authoritative "we'll be back at X" from Petpooja/admin.
//      2. Otherwise fall back to scanning the weekly outlet_timings
//         schedule forward (today remaining slots, then next 7 days).
// ==========================
const parseISTNaiveDateTime = (str) => {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const h = Number(m[4]), mi = Number(m[5]), s = Number(m[6] || 0);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MIN * 60000;
  return new Date(utcMs);
};

const getNextOpenDateTime = (timingRows, isActive, manualOpenAt) => {
  if (!isActive) {
    const manualDate = parseISTNaiveDateTime(manualOpenAt);
    if (manualDate && !isNaN(manualDate.getTime())) {
      return manualDate.toISOString();
    }
    if (!manualOpenAt) return null;
  }

  if (!timingRows || timingRows.length === 0) return null;

  const { istDay, istMin } = getNowIST();

  for (let offset = 0; offset <= 7; offset++) {
    const dow = (istDay + offset) % 7;
    const daySlots = timingRows
      .filter((r) => Number(r.day_of_week) === dow && r.is_closed !== true && r.is_closed !== "true")
      .sort((a, b) => toMin(a.open_time) - toMin(b.open_time));

    for (const slot of daySlots) {
      const openMin = toMin(slot.open_time);
      if (offset === 0 && openMin <= istMin) continue;
      return istToUTCISO(offset, openMin);
    }
  }

  return null;
};

// ==========================
// ✅ MAIN: GET BRANDS WITH BEST OUTLET
// ==========================
const getBrandsWithOutlet = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasLocation = !isNaN(lat) && !isNaN(lng);

    const { data: brands, error: brandError } = await supabase
      .from("brands")
      .select("*");

    if (brandError) {
      return res.error({ message: "Failed to fetch brands", status: 500 });
    }

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

    const timingsByOutlet = {};
    for (const row of timingRowsRaw) {
      if (!timingsByOutlet[row.outlet_id]) timingsByOutlet[row.outlet_id] = [];
      timingsByOutlet[row.outlet_id].push(row);
    }

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
        const nextOpenAt = open
          ? null
          : getNextOpenDateTime(timingRows, o.is_active, o.outlet_open_date_time);

        const { istDay } = getNowIST();
        const todaySlot = (timingRows || []).find(
          (r) => Number(r.day_of_week) === istDay && r.is_closed !== true && r.is_closed !== "true"
        );

        return {
          ...o,
          distance,
          duration,
          is_open: open,
          outlet_open_date_time: nextOpenAt,
          open_time: todaySlot?.open_time ?? null,
          close_time: todaySlot?.close_time ?? null,
        };
      })
    );

    const outletsByBrand = {};
    for (const o of enriched) {
      if (!outletsByBrand[o.brand_id]) outletsByBrand[o.brand_id] = [];
      outletsByBrand[o.brand_id].push(o);
    }

    const result = brands.map((brand) => {
      const brandOutlets = outletsByBrand[brand.id] || [];

      if (brandOutlets.length === 0) {
        return { ...brand, is_closed: true, outlet_open_date_time: null, selected_outlet: null };
      }

      brandOutlets.sort((a, b) => {
        if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
        return a.distance - b.distance;
      });

      const openOutlet = brandOutlets.find((o) => o.is_open);
      const selected   = openOutlet || brandOutlets[0];

      // If closed, show the EARLIEST next-open time across all of the brand's outlets —
      // not just the nearest one — so a brand isn't shown "closed all day" when a
      // different outlet of the same brand opens sooner.
      let brandOpenAt = null;
      if (!openOutlet) {
        const candidateTimes = brandOutlets
          .map((o) => o.outlet_open_date_time)
          .filter(Boolean)
          .map((t) => new Date(t).getTime());
        if (candidateTimes.length > 0) {
          brandOpenAt = new Date(Math.min(...candidateTimes)).toISOString();
        }
      }

      return {
        ...brand,
        is_closed: !openOutlet,
        outlet_open_date_time: brandOpenAt,

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
          open_time:          selected.open_time,
          close_time:         selected.close_time,
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