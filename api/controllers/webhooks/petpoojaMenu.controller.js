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

/* -------------------- CONSTANTS -------------------- */

const WEBHOOK_RESPONSE = { message: "Webhook received" };

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

  /* ---- Capture full request immediately ---- */
  const { data: logData } = await supabase
    .from("patpuja_webhook_logs")
    .insert({
      request_url:   req.originalUrl || req.url,
      request_body:  req.body ?? null,
      response_body: WEBHOOK_RESPONSE,   // pre-filled; always what we return
      is_success:    true,
      type:          "WEBHOOK",
    })
    .select("id")
    .single();

  const webhookLogId = logData?.id ?? null;

  /* ---- Single exit point — always responds 200 to webhook ---- */
  const done = async (patch = {}) => {
    if (webhookLogId) {
      await supabase
        .from("patpuja_webhook_logs")
        .update({ response_body: WEBHOOK_RESPONSE, ...patch })
        .eq("id", webhookLogId);
    }
    return res.success(WEBHOOK_RESPONSE);
  };

  try {
    const rawPayload = req.body;

    /* ---- Validation ---- */
    const { error: validationError } = pushMenuSchema.validate(rawPayload);
    if (validationError) {
      return done({
        is_success: false,
        message: `Validation failed: ${validationError.message}`,
      });
    }

    /* ---- Extract identifiers ---- */
    const restaurant      = rawPayload?.restaurants?.[0];
    const details         = restaurant?.details || {};
    const menusharingcode = details?.menusharingcode;
    const restaurantid    = restaurant?.restaurantid;
    const rest_id         = String(menusharingcode || restaurantid || "").trim();

    if (!rest_id) {
      return done({ is_success: false, message: "Restaurant id missing" });
    }

    const restaurant_name = details.restaurantname || null;
    const latitude        = details.latitude  ? Number(details.latitude)  : null;
    const longitude       = details.longitude ? Number(details.longitude) : null;
    const restaurant_id   = restaurantid ? String(restaurantid) : null;
    const now             = new Date().toISOString();

    /* ---- Process images (failures are non-fatal, logged internally) ---- */
    const finalPayload = await persistMenuImages(structuredClone(rawPayload), rest_id);
    const finalHash    = hashPayload(finalPayload);

    /* ---- Ensure restaurant row exists ---- */
    let supabase_resturent_id = null;

    const { data: existingRestaurant } = await supabase
      .from("restaurants")
      .select("id")
      .eq("petpuja_resturant_id", restaurant.restaurantid)
      .single();

    if (!existingRestaurant) {
      const { data: insertedRestaurant, error: insertRestErr } = await supabase
        .from("restaurants")
        .insert({
          name:                 restaurant?.details?.restaurantname || "",
          petpuja_resturant_id: restaurant.restaurantid,
        })
        .select("id")
        .single();

      if (insertRestErr) throw insertRestErr;
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

    /* ---- Replace cache (delete → insert) ---- */
    const { error: deleteError } = await supabase
      .from("petpooja_menu_cache")
      .delete()
      .eq("rest_id", rest_id);

    if (deleteError) throw deleteError;

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

    /* ---- Verify cache was written before clearing stock ---- */
    const { data: insertedCache, error: verifyError } = await supabase
      .from("petpooja_menu_cache")
      .select("id, rest_id")
      .eq("rest_id", rest_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (verifyError) throw verifyError;

    /* ---- Clear old stock (non-fatal) ---- */
    if (insertedCache?.rest_id === rest_id) {
      const { error: stockDeleteError } = await supabase
        .from("menu_item_stock")
        .delete()
        .eq("rest_id", rest_id);

      if (stockDeleteError) {
        console.error("Stock delete error:", stockDeleteError.message);
        // Log warning but still treat overall sync as success
        return done({
          is_success: false,
          message: `Menu synced but stock clear failed: ${stockDeleteError.message}`,
        });
      }

      console.log(`Stock cleared for ${rest_id}`);
    }

    /* ---- All steps completed ---- */
    return done({ is_success: true, message: "Menu sync success" });

  } catch (err) {
    console.error("Webhook error:", err);
    return done({ is_success: false, message: err?.message || "Unknown error" });
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