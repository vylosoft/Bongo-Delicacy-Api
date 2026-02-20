// controllers/petpoojaStore.controller.js
const supabase = require("../../../config/db");

const DEFAULT_TZ_OFFSET = "+05:30";

function normalizeTime(time, tzOffset = DEFAULT_TZ_OFFSET) {
  if (!time || typeof time !== "string") return null;
  const t = time.trim();
  if (!t) return null;
  const isoish = t.replace(" ", "T") + tzOffset;
  const d = new Date(isoish);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function handlePetPoojaStoreWebhook(req, res) {
  try {
    const body = req.body || {};
    const restID = body.restID;

    if (!restID) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "missing restID",
      });
    }

    // PetPooja:
    // 1 = OPEN
    // 0 = CLOSED
    const store_status = Number(body.store_status);
    const is_active = store_status === 1;

    // Always save turn_on_time regardless of store_status
    // (represents scheduled next open time, useful even when store is closing)
    const open_hour = normalizeTime(body.turn_on_time);

    const updates = {
      is_active,
      open_hour,
    };

    const { data, error } = await supabase
      .from("outlet")
      .update(updates)
      .eq("petpooja_outlet_id", restID)
      .select("id, petpooja_outlet_id, is_active, open_hour");

    if (error) {
      console.error("Supabase update error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Supabase update failed",
      });
    }

    if (!data || data.length === 0) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "restaurant not found",
        restID,
      });
    }

    return res.status(200).json({
      ok: true,
      restID,
      row: data[0],
    });
  } catch (e) {
    console.error("Webhook crash:", e);
    return res.status(500).json({
      ok: false,
      error: e.message || "Server error",
    });
  }
}

module.exports = { handlePetPoojaStoreWebhook };