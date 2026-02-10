const supabase = require("../../../config/db");

exports.itemStockWebhook = async (req, res) => {
  try {
    const { restID, inStock, itemID } = req.body;

    if (!restID || typeof inStock === "undefined" || !Array.isArray(itemID)) {
      return res.status(400).json({
        success: false,
        message: "Missing restID, inStock, or itemID[]",
      });
    }

    const rows = itemID.map((id) => ({
      rest_id: String(restID),
      item_id: String(id),
      in_stock: inStock ? "1" : "0",
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("menu_item_stock")
      .upsert(rows, { onConflict: "rest_id,item_id" });

    if (error) {
      console.error("Supabase upsert error:", error);
      return res.status(500).json({ success: false, message: "DB error" });
    }

    return res.json({ success: true, saved: rows });
  } catch (e) {
    console.error("itemStockWebhook error:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
