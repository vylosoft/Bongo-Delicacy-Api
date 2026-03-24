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

/*
-----------------------------------------
1️⃣ PETPOOJA WEBHOOK → UPDATE STORE STATUS
PetPooja calls this endpoint when store
status changes on their side
-----------------------------------------
*/

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
    const is_active = store_status === 1;

    const outlet_open_date_time = normalizeTime(body.turn_on_time);

    const updates = {
      is_active,
      outlet_open_date_time,
    };

    const { data, error } = await supabase
      .from("outlet")
      .update(updates)
      .eq("petpooja_outlet_id", restID)
      .select("id, petpooja_outlet_id, is_active, outlet_open_date_time");

    if (error) {
      console.error("Supabase update error:", error);

      return res.status(500).json({
        ok: false,
        error: error.message,
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
      http_code: 200,
      status: "success",
      message: `Store Status updated successfully for store ${restID}`,
    });
  } catch (e) {
    console.error("Webhook crash:", e);

    return res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
}

/*
-----------------------------------------
2️⃣ GET STORE STATUS API
Your app calls this to read current
store status from your DB
-----------------------------------------
*/

async function getStoreStatus(req, res) {
  try {
    const body = req.body || {};
    const restID = body.restID;

    if (!restID) {
      return res.status(400).json({
        http_code: 400,
        status: "failed",
        message: "restID is required",
      });
    }

    const { data, error } = await supabase
      .from("outlet")
      .select("is_active")
      .eq("petpooja_outlet_id", restID)
      .single();

    if (error || !data) {
      return res.status(404).json({
        http_code: 404,
        status: "failed",
        message: "Restaurant not found",
      });
    }

    const store_status = data.is_active ? "1" : "0";

    return res.status(200).json({
      http_code: 200,
      status: "success",
      store_status,
      message: "Store Delivery Status fetched successfully",
    });
  } catch (error) {
    console.error("Get Store Status Error:", error);

    return res.status(500).json({
      http_code: 500,
      status: "failed",
      message: "Server error",
    });
  }
}

module.exports = {
  handlePetPoojaStoreWebhook,
  getStoreStatus,
};