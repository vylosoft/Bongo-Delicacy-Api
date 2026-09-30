const Joi = require("joi");
const supabase = require("../../../config/db");

/* ─────────────────────────────────────────
   VALIDATION
───────────────────────────────────────── */

const itemStockSchema = Joi.object({
  restID: Joi.alternatives()
    .try(Joi.string(), Joi.number())
    .required(),

  inStock: Joi.boolean().required(),

  autoTurnOnTime: Joi.string()
    .optional()
    .allow(null),

  customTurnOnTime: Joi.string()
    .optional()
    .allow(null),

  itemID: Joi.array()
    .items(Joi.alternatives().try(Joi.string(), Joi.number()))
    .min(1)
    .required(),
}).unknown(true);

/* ─────────────────────────────────────────
   HELPER — Parse Petpooja's IST time → UTC
   Petpooja sends customTurnOnTime as IST
   e.g. "2026-05-21 16:26:00" (which means
   4:26 PM IST = 10:56 AM UTC)
   We append +05:30 before parsing.
───────────────────────────────────────── */

function parseISTtoUTC(istString) {
  if (!istString) return null;

  try {
    // Already has timezone info — trust it
    if (
      istString.includes("+") ||
      istString.includes("Z") ||
      istString.endsWith("z")
    ) {
      return new Date(istString).toISOString();
    }

    // Petpooja sends bare datetime without tz — treat as IST
    const withTz = istString.trim().replace(" ", "T") + "+05:30";
    const parsed = new Date(withTz);

    if (isNaN(parsed.getTime())) {
      console.error("[itemStockWebhook] Invalid turn_on_time:", istString);
      return null;
    }

    return parsed.toISOString(); // stored as UTC in DB
  } catch (e) {
    console.error("[itemStockWebhook] parseISTtoUTC error:", e.message);
    return null;
  }
}

/* ─────────────────────────────────────────
   BACKGROUND PROCESSOR
───────────────────────────────────────── */

async function processItemStock(rawPayload, webhookLogId) {
  try {
    /* ── Validate ── */

    const { error: validationError } = itemStockSchema.validate(rawPayload);

    if (validationError) {
      await supabase
        .from("patpuja_webhook_logs")
        .update({
          is_success: false,
          message:    validationError.message,
          response_body: { success: false, message: "Invalid payload" },
        })
        .eq("id", webhookLogId);

      return;
    }

    const { restID, inStock, itemID, autoTurnOnTime, customTurnOnTime } =
      rawPayload;

    const rest_id = String(restID).trim();

    /* ── Resolve turn_on_time ──
       Only set when item is marked OUT of stock AND
       autoTurnOnTime === "custom" AND customTurnOnTime is provided.
       Always convert from IST → UTC before storing.
    ── */

    const turn_on_time_utc =
      !inStock && autoTurnOnTime === "custom" && customTurnOnTime
        ? parseISTtoUTC(customTurnOnTime)
        : null;

    /* ── Delete old stock rows for these items ── */

    const { error: deleteError } = await supabase
      .from("menu_item_stock")
      .delete()
      .eq("rest_id", rest_id)
      .in(
        "item_id",
        itemID.map((id) => String(id)),
      );

    if (deleteError) throw deleteError;

    /* ── Build fresh rows ── */

    const rows = itemID.map((id) => ({
      rest_id:      rest_id,
      item_id:      String(id),
      in_stock:     inStock ? "1" : "0",
      turn_on_time: turn_on_time_utc,
      updated_at:   new Date().toISOString(),
    }));

    /* ── Insert fresh rows ── */

    const { error: insertError } = await supabase
      .from("menu_item_stock")
      .insert(rows);

    if (insertError) throw insertError;

    /* ── Update log as success ── */

    await supabase
      .from("patpuja_webhook_logs")
      .update({
        is_success:    true,
        message:       "Item stock sync success",
        response_body: { success: true, saved: rows },
      })
      .eq("id", webhookLogId);

  } catch (e) {
    console.error("[itemStockWebhook] processItemStock error:", e.message);

    await supabase
      .from("patpuja_webhook_logs")
      .update({
        is_success:    false,
        message:       e?.message || "Unknown error",
        response_body: { success: false, message: "Internal error" },
      })
      .eq("id", webhookLogId);
  }
}

/* ─────────────────────────────────────────
   WEBHOOK HANDLER
───────────────────────────────────────── */

exports.itemStockWebhook = async (req, res) => {
  const petpoojaResponse = { success: "1", message: "Stock updated successfully." };

  /* ── Log immediately ── */

  const { data: logData } = await supabase
    .from("patpuja_webhook_logs")
    .insert({
      request_url:   req.originalUrl || req.url,
      request_body:  req.body ?? null,
      response_body: petpoojaResponse,
      type:          "WEBHOOK",
      is_success:    true,
    })
    .select("id")
    .single();

  const webhookLogId = logData?.id ?? null;

  /* ── Fire and forget ── */

  processItemStock(req.body, webhookLogId).catch((e) =>
    console.error("[itemStockWebhook] Background error:", e.message),
  );

  /* ── Respond to Petpooja immediately ── */

  return res.status(200).json(petpoojaResponse);
};