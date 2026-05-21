const cron = require("node-cron");
const supabase = require("../../config/db");

/* ─────────────────────────────────────────
   Stock Expiry Cron
   Runs every 15 seconds.
   Finds items where in_stock = "0" and
   turn_on_time has passed (UTC comparison),
   then resets them to in_stock = "1".
───────────────────────────────────────── */

cron.schedule("*/15 * * * * *", async () => {
  try {
    const now = new Date().toISOString(); // UTC

    /* ── Fetch all out-of-stock items with a turn_on_time ── */

    const { data, error } = await supabase
      .from("menu_item_stock")
      .select("id, item_id, rest_id, turn_on_time")
      .eq("in_stock", "0")
      .not("turn_on_time", "is", null)
      .lte("turn_on_time", now); // turn_on_time <= now (pure UTC)

    if (error) {
      console.error("[StockCron] Fetch error:", error.message);
      return;
    }

    if (!data || data.length === 0) {
      return; // nothing to do
    }

    const ids = data.map((item) => item.id);

    console.log(`[StockCron] Resetting ${ids.length} expired item(s):`, ids);

    /* ── Reset expired items ── */

    const { error: updateError } = await supabase
      .from("menu_item_stock")
      .update({
        in_stock:     "1",
        turn_on_time: null,
        updated_at:   new Date().toISOString(),
      })
      .in("id", ids);

    if (updateError) {
      console.error("[StockCron] Update error:", updateError.message);
      return;
    }

    console.log(`[StockCron] Successfully reset ${ids.length} item(s)`);

  } catch (e) {
    console.error("[StockCron] Fatal error:", e.message);
  }
});