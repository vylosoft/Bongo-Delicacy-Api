const Joi = require("joi");
const supabase = require("../../../config/db");

/* -------------------- VALIDATION -------------------- */

const itemStockSchema = Joi.object({
  restID: Joi.alternatives()
    .try(Joi.string(), Joi.number())
    .required(),

  inStock: Joi.boolean().required(),

  itemID: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.string(),
        Joi.number(),
      ),
    )
    .min(1)
    .required(),
}).unknown(true);

/* -------------------- WEBHOOK -------------------- */

exports.itemStockWebhook = async (req, res) => {
  /* ---- Store raw webhook log first ---- */

  const { data: logData } = await supabase
    .from("patpuja_webhook_logs")
    .insert({
      request_url: req.originalUrl || req.url,
      request_body: req.body ?? null,
      webhook_type: "item_stock",
      is_success: true,
    })
    .select("id")
    .single();

  const webhookLogId = logData?.id ?? null;

  try {
    const rawPayload = req.body;

    /* ---- Validate payload ---- */

    const { error: validationError } =
      itemStockSchema.validate(rawPayload);

    if (validationError) {
      await supabase
        .from("patpuja_webhook_logs")
        .update({
          is_success: false,
          message: validationError.message,
          response_body: {
            success: false,
            message: "Invalid payload",
          },
        })
        .eq("id", webhookLogId);

      return res.json({
        success: true,
        message: "Webhook received",
      });
    }

    const { restID, inStock, itemID } =
      rawPayload;

    const rest_id = String(restID).trim();

    /* ---- Delete old stock rows first ---- */

    const { error: deleteError } =
      await supabase
        .from("menu_item_stock")
        .delete()
        .eq("rest_id", rest_id)
        .in(
          "item_id",
          itemID.map((id) => String(id)),
        );

    if (deleteError) {
      throw deleteError;
    }

    /* ---- Prepare fresh rows ---- */

    const rows = itemID.map((id) => ({
      rest_id: rest_id,
      item_id: String(id),
      in_stock: inStock ? "1" : "0",
      updated_at: new Date().toISOString(),
    }));

    /* ---- Insert fresh rows ---- */

    const { error: insertError } =
      await supabase
        .from("menu_item_stock")
        .insert(rows);

    if (insertError) {
      throw insertError;
    }

    /* ---- Update success log ---- */

    await supabase
      .from("patpuja_webhook_logs")
      .update({
        is_success: true,
        message:
          "Item stock sync success",
        response_body: {
          success: true,
          saved: rows,
        },
      })
      .eq("id", webhookLogId);

    /* ---- Always success response to PetPooja ---- */

    return res.json({
      success: true,
      message: "Webhook received",
    });
  } catch (e) {
    console.error(
      "itemStockWebhook error:",
      e,
    );

    /* ---- Store internal error in logs ---- */

    await supabase
      .from("patpuja_webhook_logs")
      .update({
        is_success: false,
        message:
          e?.message || "Unknown error",
        response_body: {
          success: false,
          message: "Internal error",
        },
      })
      .eq("id", webhookLogId);

    /* ---- Never return error to PetPooja ---- */

    return res.json({
      success: true,
      message: "Webhook received",
    });
  }
};