
const { orderStatusConfig } = require("../../config/constant");

const { createClient } = require('@supabase/supabase-js');
// const supabase = require("../../config/db");
const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
