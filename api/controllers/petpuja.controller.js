
const { orderStatusConfig } = require("../../config/constant");

const { createClient } = require('@supabase/supabase-js');
// const supabase = require("../../config/db");
const supabase = require("../../config/db");

exports.updateOrderStatus = async (req, res) => {
  try {
    // return res.send({a:req.body})
    console.log("PetPuja Callback Received:", req.body);
    console.log("PetPuja Callback Received:", typeof req.body);
    const statusIndicator = parseInt(req.body.status);
    const statusMap = orderStatusConfig();
    const orderStatus = statusMap.get(statusIndicator);
    const orderId = req.body.orderID;
    console.log("Mapped Order Status:", orderStatus);
    // const resObj = {
    //   ...req.body,
    //   statusDescription: orderStatus
    // }

    const { data, error } = await supabase
      .from('orders')
      .update({ status: orderStatus })
      .eq('id', orderId)
      .select()
      .single();
    if (error) {
      console.error("Supabase Update Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update order status"
      });
    }
    return res.success({ data: data });
  } catch (err) {
    console.error("Callback Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};
