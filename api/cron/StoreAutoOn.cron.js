const cron = require("node-cron");
const supabase = require("../../config/db");

const IST_OFFSET_MIN = 5 * 60 + 30;

/**
 * outlet_open_date_time is a `timestamp` column (NO timezone) storing IST
 * wall-clock values as typed by the admin / sent by Petpooja (e.g.
 * "2026-07-03 15:45:00" meaning 3:45 PM IST — not UTC, not server-local).
 *
 * Postgres compares naive timestamps literally, digit-for-digit. So we must
 * hand it a naive string that represents the CURRENT IST wall-clock time —
 * NOT `new Date().toISOString()`, which is UTC and would be off by 5:30.
 */
const nowAsISTNaiveString = () => {
  const ist = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
};

/* ─────────────────────────────────────────
   Store Auto-On Cron
   Runs every 15 seconds.
   Finds outlets where is_active = false and
   outlet_open_date_time (IST wall-clock, naive) has passed,
   then turns them back on.
───────────────────────────────────────── */

cron.schedule("*/15 * * * * *", async () => {
  try {
    const nowIST = nowAsISTNaiveString(); // e.g. "2026-07-03 15:45:03"

    const { data, error } = await supabase
      .from("outlet")
      .select("id, petpooja_outlet_id, outlet_open_date_time")
      .eq("is_active", false)
      .not("outlet_open_date_time", "is", null)
      .lte("outlet_open_date_time", nowIST); // both sides now naive IST wall-clock

    if (error) {
      console.error("[StoreCron] Fetch error:", error.message);
      return;
    }

    if (!data || data.length === 0) return;

    const ids = data.map((outlet) => outlet.id);

    console.log(`[StoreCron] Turning on ${ids.length} expired outlet(s) at IST ${nowIST}:`, ids);

    const { error: updateError } = await supabase
      .from("outlet")
      .update({
        is_active: true,
        outlet_open_date_time: null,
      })
      .in("id", ids);

    if (updateError) {
      console.error("[StoreCron] Update error:", updateError.message);
      return;
    }

    console.log(`[StoreCron] Successfully turned on ${ids.length} outlet(s)`);

  } catch (e) {
    console.error("[StoreCron] Fatal error:", e.message);
  }
});