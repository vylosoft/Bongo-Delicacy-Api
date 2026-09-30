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

  // The ONLY response Petpooja ever gets — no errors, no matter what
  const petpoojaResponse = {
    http_code: 200,
    status: "success",
    message: "Webhook received",
  };

  /* ---- Log raw incoming request first ---- */
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

    if (logError) {
      console.error("Webhook log insert failed:", logError);
    }

    webhookLogId = logData?.id ?? null;
  } catch (logInsertErr) {
    console.error("Webhook log insert threw:", logInsertErr?.message);
  }

  /* ---- Helper to update log without ever throwing ---- */
  async function updateLog({ is_success, message }) {
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
    } catch (err) {
      console.error("Log update failed:", err?.message);
    }
  }

  try {
    const body = req.body || {}; 
    const restID = body.restID; 
 
    if (!restID) {
      await updateLog({ is_success: false, message: "Missing restID in request body" });
      return res.status(200).json(petpoojaResponse);
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
      await updateLog({ is_success: false, message: error.message });
      return res.status(200).json(petpoojaResponse);
    } 
 
    if (!data || data.length === 0) {
      await updateLog({ is_success: false, message: `Restaurant not found for restID: ${restID}` });
      return res.status(200).json(petpoojaResponse);
    } 

    const successMessage = `Store status updated successfully for store ${restID}`;
    await updateLog({ is_success: true, message: successMessage });
    return res.status(200).json(petpoojaResponse);

  } catch (e) { 
    console.error("Webhook crash:", e);
    await updateLog({ is_success: false, message: e?.message || "Unknown error" });
    return res.status(200).json(petpoojaResponse);
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