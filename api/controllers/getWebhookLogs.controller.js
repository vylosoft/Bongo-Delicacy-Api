const supabase = require("../../config/db");

/* -------------------- GET ALL WEBHOOK LOGS -------------------- */

const getAllMenuWebhookLogs = async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const offset   = (page - 1) * limit;

    // Optional filters
    const is_success = req.query.is_success; // "true" | "false"

    let query = supabase
      .from("patpuja_webhook_logs")
      .select("id, created_at, request_url, request_body, response_body, is_success", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (is_success === "true")  query = query.eq("is_success", true);
    if (is_success === "false") query = query.eq("is_success", false);

    const { data, error, count } = await query;

    if (error) {
      console.error("getAllMenuWebhookLogs error:", error);
      return res.status(500).json({ ok: false, message: "Failed to fetch webhook logs" });
    }

    return res.status(200).json({
      ok     : true,
      total  : count,
      page,
      limit,
      data,
    });
  } catch (err) {
    console.error("getAllMenuWebhookLogs error:", err);
    return res.status(500).json({ ok: false });
  }
};

module.exports = { getAllMenuWebhookLogs };