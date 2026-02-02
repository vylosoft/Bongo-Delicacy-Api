// controllers/petpoojaStore.controller.js
const { supabase } = require("../../../utils/supabaseClient");

const DEFAULT_TZ_OFFSET = "+05:30";

function normalizeTurnOnTime(turn_on_time, tzOffset = DEFAULT_TZ_OFFSET) {
  if (!turn_on_time || typeof turn_on_time !== "string") return null;

  const t = turn_on_time.trim();
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

    const store_status = Number(body.store_status);
    const isclosed = store_status === 0;

    const turn_on_time = isclosed
      ? normalizeTurnOnTime(body.turn_on_time)
      : null;

    const updates = {
      isclosed,
      turn_on_time,
    };

    const { data, error } = await supabase
      .from("petpooja_menu_cache")
      .update(updates)
      .eq("rest_id", restID)
      .select("id, rest_id, isclosed, turn_on_time");

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
