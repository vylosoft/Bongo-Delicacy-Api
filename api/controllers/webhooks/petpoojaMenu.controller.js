const crypto = require("crypto");
const Joi = require("joi");
const { supabase } = require("../../../utils/supabaseClient");

// Validate only minimum fields; do not “shape” the payload you store
const pushMenuSchema = Joi.object({
  success: Joi.string().required(),
  restaurants: Joi.array()
    .items(
      Joi.object({
        restaurantid: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
      }).unknown(true)
    )
    .min(1)
    .required(),
}).unknown(true);

const hashPayload = (payload) => {
  // hash based on exactly what we store (object form)
  const raw = JSON.stringify(payload);
  return crypto.createHash("sha256").update(raw).digest("hex");
};

exports.pushMenuWebhook = async (req, res) => {
  try {
    // validate only, but store req.body (full webhook object)
    const { error } = pushMenuSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    // IMPORTANT: store full webhook payload
    const payload = req.body;

    // choose your primary id safely
    const menusharingcode = payload?.restaurants?.[0]?.details?.menusharingcode;
    const restaurantid = payload?.restaurants?.[0]?.restaurantid;

    const rest_id = String(menusharingcode || restaurantid || "").trim();
    if (!rest_id) {
      return res.status(400).json({ ok: false, message: "rest_id not found in payload" });
    }

    const version_hash = hashPayload(payload);
    const now = new Date().toISOString();

    // 1) Store full history event
    await supabase.from("petpooja_menu_events").insert([
      { rest_id, payload, version_hash, created_at: now },
    ]);

    // 2) Upsert latest cache (full payload)
    const { error: upsertError } = await supabase
      .from("petpooja_menu_cache")
      .upsert(
        {
          rest_id,
          payload, // FULL DATA from webhook
          version_hash,
          last_pushed_at: now,
          updated_at: now,
        },
        { onConflict: "rest_id" }
      );

    if (upsertError) {
      console.error("pushMenuWebhook upsert error:", upsertError);
      return res.status(500).json({ ok: false });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("pushMenuWebhook error:", e);
    return res.status(500).json({ ok: false });
  }
};

exports.getCachedMenu = async (req, res) => {
  try {
    const rest_id = String(req.query.resturent_identifier || "").trim();
    if (!rest_id) {
      return res.status(400).json({ ok: false, message: "resturent_identifier is required" });
    }

    const { data, error } = await supabase
      .from("petpooja_menu_cache")
      .select("payload,last_pushed_at,version_hash")
      .eq("rest_id", rest_id)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ ok: false, message: "Menu not cached yet" });
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error("getCachedMenu error:", e);
    return res.status(500).json({ ok: false });
  }
};
