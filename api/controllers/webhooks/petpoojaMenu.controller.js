const Joi = require("joi");
const crypto = require("crypto");
const supabase = require("../../../config/db");

/* -------------------- VALIDATION -------------------- */

const pushMenuSchema = Joi.object({
  success: Joi.string().required(),
  restaurants: Joi.array()
    .items(
      Joi.object({
        restaurantid: Joi.alternatives()
          .try(Joi.string(), Joi.number())
          .required(),
      }).unknown(true),
    )
    .min(1)
    .required(),
}).unknown(true);

/* -------------------- HELPERS -------------------- */

const hashPayload = (payload) =>
  crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);

  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("URL is not an image");

  return Buffer.from(await res.arrayBuffer());
}

async function uploadImage(buffer, rest_id, itemid) {
  const path = `menus/${rest_id}/${itemid}.jpg`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

  if (error) throw error;

  return supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
}

async function persistMenuImages(payload, rest_id) {
  if (!Array.isArray(payload.items)) return payload;

  for (const item of payload.items) {
    if (!item.itemid) continue;
    if (!item.item_image_url) continue;
    if (item.item_image_url.includes("supabase")) continue;

    try {
      const buffer = await downloadImage(item.item_image_url);
      const permanentUrl = await uploadImage(buffer, rest_id, item.itemid);
      item.item_image_url = permanentUrl;
    } catch (err) {
      console.error(`Image failed for item ${item.itemid}:`, err.message);
    }
  }

  return payload;
}

/* -------------------- WEBHOOK -------------------- */

const pushMenuWebhook = async (req, res) => {

  /* ---- 1. Log raw request — no try/catch ---- */
  const { data: logData } = await supabase
    .from("patpuja_manu_webhook")
    .insert({
      request_url: req.originalUrl || req.url,
      request_body: req.body ?? null,
      is_success: false,
    })
    .select("id")
    .single();

  const webhookLogId = logData?.id ?? null;

  /* ---- Only updates the log row — response is handled by res.success / res.error ---- */
  const updateLog = async (isSuccess, responseBody) => {
    if (!webhookLogId) return;
    await supabase
      .from("patpuja_manu_webhook")
      .update({
        response_body: responseBody,
        is_success: isSuccess,
      })
      .eq("id", webhookLogId);
  };

  /* ---- 2. Main logic ---- */
  try {
      // throw new Error("TEST ERROR: intentional error to verify DB logging");
    const { error } = pushMenuSchema.validate(req.body);
    if (error) {
      await updateLog(false, { message: error.message });
      return res.error({ message: error.message, status: 400 });
    }

    const rawPayload = req.body;
    const restaurant = rawPayload?.restaurants?.[0];
    const details = restaurant?.details || {};

    const menusharingcode = details.menusharingcode;
    const restaurantid = restaurant?.restaurantid;

    const rest_id = String(menusharingcode || restaurantid || "").trim();
    if (!rest_id) {
      await updateLog(false, { message: "rest_id not found" });
      return res.error({ message: "rest_id not found", status: 400 });
    }

    const restaurant_name = details.restaurantname || null;
    const latitude = details.latitude ? Number(details.latitude) : null;
    const longitude = details.longitude ? Number(details.longitude) : null;
    const restaurant_id = restaurantid ? String(restaurantid) : null;
    const isclosed = false;
    const now = new Date().toISOString();

    /* ---- check existing cache ---- */
    const { data: existing } = await supabase
      .from("petpooja_menu_cache")
      .select("version_hash")
      .eq("rest_id", rest_id)
      .maybeSingle();

    const finalPayload = await persistMenuImages(structuredClone(rawPayload), rest_id);
    const finalHash = hashPayload(finalPayload);

    if (existing && existing.version_hash === finalHash) {
      await updateLog(true, { skipped: true, reason: "menu unchanged" });
      return res.success({ data: { skipped: true, reason: "menu unchanged" } });
    }

    /* ---- ensure restaurant exists ---- */
    let supabase_resturent_id = null;

    const { data } = await supabase
      .from("restaurants")
      .select("id")
      .eq("petpuja_resturant_id", restaurant.restaurantid)
      .single();

    if (!data) {
      const resturentData = await supabase
        .from("restaurants")
        .insert({
          name: restaurant?.details?.restaurantname || "",
          petpuja_resturant_id: restaurant.restaurantid,
        })
        .select("id")
        .single();

      supabase_resturent_id = resturentData.data.id;
    } else {
      supabase_resturent_id = data.id;
    }

    /* ---- upsert outlet ---- */
    await supabase
      .from("outlet")
      .upsert(
        {
          resturent_id: supabase_resturent_id,
          lat: details.latitude,
          long: details.longitude,
          is_active: restaurant.active === "1",
          petpooja_outlet_id: details.menusharingcode,
          contact: details.contact,
          address: details.address,
          city: details.city,
          state: details.state,
        },
        { onConflict: "petpooja_outlet_id" },
      );

    /* ---- cache menu in petpooja_menu_cache ---- */
    const { error: upsertError } = await supabase
      .from("petpooja_menu_cache")
      .upsert(
        {
          rest_id,
          restaurant_id,
          restaurant_name,
          latitude,
          longitude,
          isclosed,
          payload: finalPayload,
          version_hash: finalHash,
          last_pushed_at: now,
          updated_at: now,
        },
        { onConflict: "rest_id" },
      );

    if (upsertError) {
      console.error("Cache upsert failed:", upsertError);
      await updateLog(false, { message: "Cache upsert failed" });
      return res.error({ message: "Cache upsert failed", status: 500 });
    }

    await updateLog(true, { result: finalPayload, count: 1 });
    return res.success({ data: { result: finalPayload, count: 1 } });

  } catch (err) {
    console.error("Webhook error:", err);
    await updateLog(false, { message: "Internal server error" });
    return res.error({ message: "Internal server error", status: 500 });
  }
};

/* -------------------- GET CACHED MENU -------------------- */

const getCachedMenu = async (req, res) => {
  try {
    const rest_id = String(req.query.resturent_identifier || "").trim();

    if (!rest_id) {
      return res.error({ message: "resturent_identifier required", status: 400 });
    }

    const { data, error } = await supabase
      .from("petpooja_menu_cache")
      .select("payload,last_pushed_at,version_hash,restaurant_name,latitude,longitude,isclosed")
      .eq("rest_id", rest_id)
      .maybeSingle();

    if (error || !data) {
      return res.error({ message: "Menu not cached yet", status: 404 });
    }

    return res.success({ data: { result: data, count: 1 } });
  } catch (err) {
    console.error("getCachedMenu error:", err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

/* -------------------- EXPORTS -------------------- */

module.exports = {
  pushMenuWebhook,
  getCachedMenu,
};