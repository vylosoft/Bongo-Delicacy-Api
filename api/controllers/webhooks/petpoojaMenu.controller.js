import crypto from "crypto";
import fetch from "node-fetch";
import Joi from "joi";
import supabase from "../../../config/db.js";

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
  const res = await fetch(url, { timeout: 10000 });

  if (!res.ok) {
    throw new Error(`Image fetch failed: ${res.status}`);
  }

  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    throw new Error("URL is not an image");
  }

  return Buffer.from(await res.arrayBuffer());
}

async function uploadImage(buffer, rest_id, itemid) {
  const path = `menus/${rest_id}/${itemid}.jpg`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  return supabase.storage
    .from("menu-images")
    .getPublicUrl(path).data.publicUrl;
}

/**
 * Images are NOT stored in DB.
 * Only URLs inside payload are replaced.
 */
async function persistMenuImages(payload, rest_id) {
  if (!Array.isArray(payload.items)) {
    return payload;
  }

  for (const item of payload.items) {
    if (!item.itemid) continue;
    if (!item.item_image_url) continue;
    if (item.item_image_url.includes("supabase")) continue;

    try {
      const buffer = await downloadImage(item.item_image_url);
      const permanentUrl = await uploadImage(buffer, rest_id, item.itemid);
      item.item_image_url = permanentUrl;
    } catch (err) {
      console.error(
        `Image failed for item ${item.itemid}:`,
        err.message
      );
    }
  }

  return payload;
}

/* -------------------- WEBHOOK -------------------- */

export const pushMenuWebhook = async (req, res) => {
  try {
    const { error } = pushMenuSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    const rawPayload = req.body;

    const restaurant = rawPayload?.restaurants?.[0];
    const details = restaurant?.details || {};

    const menusharingcode = details.menusharingcode;
    const restaurantid = restaurant?.restaurantid;

    const rest_id = String(menusharingcode || restaurantid || "").trim();

    if (!rest_id) {
      return res.status(400).json({
        ok: false,
        message: "rest_id not found",
      });
    }

    const restaurant_name = details.restaurantname || null;
    const latitude = details.latitude ? Number(details.latitude) : null;
    const longitude = details.longitude ? Number(details.longitude) : null;
    const restaurant_id = restaurantid ? String(restaurantid) : null;

    // 🔒 explicitly keep restaurant open
    const isclosed = false;

    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("petpooja_menu_cache")
      .select("version_hash")
      .eq("rest_id", rest_id)
      .maybeSingle();

    const finalPayload = await persistMenuImages(
      structuredClone(rawPayload),
      rest_id,
    );

    const finalHash = hashPayload(finalPayload);

    if (existing && existing.version_hash === finalHash) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "menu unchanged",
      });
    }
    let supabase_resturent_id = null;
    const { data, error: restFetchErr } = await supabase
      .from("restaurants")
      .select("id")
      .eq("petpuja_resturant_id", restaurant.restaurantid)
      .single();

    if (!data) {
      const resturentPayload = {
        name: restaurant?.details?.restaurantname || "",
        petpuja_resturant_id: restaurant.restaurantid
      };
      const resturentData = await supabase
        .from("restaurants")
        .insert(resturentPayload)
        .select("id")
        .single();
      console.log("db data1", resturentData);
      supabase_resturent_id = resturentData.data.id;
    } else {
      console.log("db data2", data);
      supabase_resturent_id = data.id;
    }
    
    const outletPayload = {
      resturent_id: supabase_resturent_id,
      lat: details.latitude,
      long: details.longitude,
      is_active: restaurant.active === "1" ? true : false,
      petpooja_outlet_id:details.menusharingcode,
      contact: details.contact,
      address: details.address,
      city: details.city,
      state: details.state
    }
    
    await supabase.from("outlet").upsert(outletPayload, { onConflict: "petpooja_outlet_id" }).select("id").single();
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
      return res.status(500).json({ ok: false });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ ok: false });
  }
};

/* -------------------- GET CACHED MENU -------------------- */

export const getCachedMenu = async (req, res) => {
  try {
    const rest_id = String(req.query.resturent_identifier || "").trim();

    if (!rest_id) {
      return res.status(400).json({
        ok: false,
        message: "resturent_identifier required",
      });
    }

    const { data, error } = await supabase
      .from("petpooja_menu_cache")
      .select(
        "payload,last_pushed_at,version_hash,restaurant_name,latitude,longitude,isclosed",
      )
      .eq("rest_id", rest_id)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({
        ok: false,
        message: "Menu not cached yet",
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error("getCachedMenu error:", err);
    return res.status(500).json({ ok: false });
  }
};
