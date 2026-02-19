const { orderStatusConfig } = require("../../config/constant");

const supabase = require("../../config/db");

exports.updateOrderStatus = async (req, res) => {
  try {
    console.log("PetPuja Callback Received:", req.body);
    console.log("PetPuja Callback Received:", typeof req.body);

    const statusIndicator = parseInt(req.body.status);
    const statusMap = orderStatusConfig();
    const orderStatus = statusMap.get(statusIndicator);

    const orderId = req.body.orderID;
    const restID = req.body.restID;

    console.log("Mapped Order Status:", orderStatus);

    const { data, error } = await supabase
      .from("orders")
      .update({ status: orderStatus })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Supabase Update Error:", error);
      return res.status(500).json({
        success: "0",
        message: "Failed to update order status",
      });
    }

    // ✅ Required response format
    return res.status(200).json({
      success: "1",
      message: "Order status updated successfully.",
      restID: restID,
      orderID: orderId,
      status: String(statusIndicator),
    });
  } catch (err) {
    console.error("Callback Error:", err);

    return res.status(500).json({
      success: "0",
      message: "Internal Server Error",
    });
  }
};
