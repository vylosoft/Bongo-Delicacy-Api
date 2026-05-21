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
    if (!item.itemid || !item.item_image_url) continue;
    if (item.item_image_url.includes("supabase")) continue;
    try {
      const buffer = await downloadImage(item.item_image_url);
      item.item_image_url = await uploadImage(buffer, rest_id, item.itemid);
    } catch (err) {
      console.error(`Image failed for item ${item?.itemid}:`, err?.message);
    }
  }
  return payload;
}

/* -------------------- WEBHOOK -------------------- */

const pushMenuWebhook = async (req, res) => {

  // ── 1. Respond to Petpooja IMMEDIATELY ──────────────────────────────────
  // Must happen before any async work — Petpooja times out in ~5s
  const petpoojaResponse = {
    http_code: 200,
    status:    "success",
    message:   "Webhook received",
  };
  res.status(200).json(petpoojaResponse);

  // ── 2. Log the raw request (Petpooja already got its 200 above) ──────────
  let webhookLogId = null;
  try {
    const { data: logData, error: logError } = await supabase
      .from("patpuja_webhook_logs")
      .insert({
        request_url:   req.originalUrl || req.url,
        request_body:  req.body ?? null,
        response_body: petpoojaResponse,
        is_success:    null,
        message:       "Processing started",
        type:          "WEBHOOK",
      })
      .select("id")
      .single();

    if (logError) console.error("Log insert failed:", logError.message);
    webhookLogId = logData?.id ?? null;
  } catch (e) {
    console.error("Log insert threw:", e?.message);
  }

  // ── Helper: update log without ever throwing ─────────────────────────────
  async function updateLog(is_success, message) {
    if (!webhookLogId) return;
    try {
      await supabase
        .from("patpuja_webhook_logs")
        .update({
          is_success,
          message,
          response_body: is_success
            ? { ...petpoojaResponse, message }
            : { success: "0", error: message },
        })
        .eq("id", webhookLogId);
    } catch (e) {
      console.error("Log update failed:", e?.message);
    }
  }

  // ── 3. Process everything in background ─────────────────────────────────
  // Petpooja is already gone — nothing here affects their response
  try {
    const rawPayload = req.body;

    /* ---- Validation ---- */
    const { error: validationError } = pushMenuSchema.validate(rawPayload);
    if (validationError) {
      await updateLog(false, `Validation failed: ${validationError.message}`);
      return;
    }

    const restaurant      = rawPayload?.restaurants?.[0];
    const details         = restaurant?.details || {};
    const menusharingcode = details?.menusharingcode;
    const restaurantid    = restaurant?.restaurantid;
    const rest_id         = String(menusharingcode || restaurantid || "").trim();

    if (!rest_id) {
      await updateLog(false, "Restaurant id missing");
      return;
    }

    const restaurant_name = details.restaurantname || null;
    const latitude        = details.latitude  ? Number(details.latitude)  : null;
    const longitude       = details.longitude ? Number(details.longitude) : null;
    const restaurant_id   = restaurantid ? String(restaurantid) : null;
    const now             = new Date().toISOString();

    /* ---- Process Images ---- */
    const finalPayload = await persistMenuImages(structuredClone(rawPayload), rest_id);
    const finalHash    = hashPayload(finalPayload);

    /* ---- Ensure restaurant exists ---- */
    let supabase_resturent_id = null;

    const { data: existingRestaurant } = await supabase
      .from("restaurants")
      .select("id")
      .eq("petpuja_resturant_id", restaurant.restaurantid)
      .maybeSingle();

    if (!existingRestaurant) {
      const { data: insertedRestaurant, error } = await supabase
        .from("restaurants")
        .insert({
          name:                 restaurant?.details?.restaurantname || "",
          petpuja_resturant_id: restaurant.restaurantid,
        })
        .select("id")
        .single();

      if (error) throw error;
      supabase_resturent_id = insertedRestaurant.id;
    } else {
      supabase_resturent_id = existingRestaurant.id;
    }

    /* ---- Upsert outlet ---- */
    const { error: outletError } = await supabase
      .from("outlet")
      .upsert(
        {
          resturent_id:       supabase_resturent_id,
          lat:                details.latitude,
          long:               details.longitude,
          is_active:          restaurant.active === "1",
          petpooja_outlet_id: details.menusharingcode,
          contact:            details.contact,
          address:            details.address,
          city:               details.city,
          state:              details.state,
        },
        { onConflict: "petpooja_outlet_id" }
      );

    if (outletError) throw outletError;

    /* ---- Delete old cache ---- */
    const { error: deleteError } = await supabase
      .from("petpooja_menu_cache")
      .delete()
      .eq("rest_id", rest_id);

    if (deleteError) throw deleteError;

    /* ---- Insert fresh cache ---- */
    const { error: insertError } = await supabase
      .from("petpooja_menu_cache")
      .insert({
        rest_id,
        restaurant_id,
        restaurant_name,
        latitude,
        longitude,
        isclosed:       false,
        payload:        finalPayload,
        version_hash:   finalHash,
        last_pushed_at: now,
        updated_at:     now,
      });

    if (insertError) throw insertError;

    /* ---- Verify cache written ---- */
    const { data: insertedCache, error: verifyError } = await supabase
      .from("petpooja_menu_cache")
      .select("id,rest_id")
      .eq("rest_id", rest_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (verifyError) throw verifyError;

    /* ---- Clear old stock ---- */
    if (insertedCache?.rest_id === rest_id) {
      const { error: stockDeleteError } = await supabase
        .from("menu_item_stock")
        .delete()
        .eq("rest_id", rest_id);

      if (stockDeleteError) {
        await updateLog(false, `Menu synced but stock clear failed: ${stockDeleteError.message}`);
        return;
      }
    }

    await updateLog(true, `Menu sync success for rest_id: ${rest_id}`);

  } catch (err) {
    console.error("Webhook processing error:", err);
    await updateLog(false, err?.message || "Unknown error");
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
      .select("payload, last_pushed_at, version_hash, restaurant_name, latitude, longitude, isclosed")
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

module.exports = { pushMenuWebhook, getCachedMenu };