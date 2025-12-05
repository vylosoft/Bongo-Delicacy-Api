const Razorpay = require("razorpay")
const { createClient } = require("@supabase/supabase-js")
const { cancelPetpujaOrder } = require("../helpers/petpujaHelper")
const env = require("../../config/env.js")

const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY"
)

const cancelOrder = async (req, res) => {
 
  try {
    const clientorderID = req.body.clientorderID || req.body.clientorderid
    const reason = req.body.reason || "Cancelled by customer"
    const amount = req.body.amount

    if (!clientorderID) {
      return res.status(400).json({
        success: false,
        message: "clientorderID is required",
      })
    }

    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      })
    }

    const refundAmount = Number(amount)

    // fetch order
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", clientorderID)
      .single()
      

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      })
    }

    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return res.status(400).json({
        success: false,
        message: "Order already cancelled",
      })
    }

    // Razorpay refund if applicable
    if (order.razorpay_payment_id) {
      const razorpay = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET,
      })

      await razorpay.refunds.create({
        payment_id: order.razorpay_payment_id,
        amount: refundAmount * 100,
        notes: { clientorderID, reason },
      })
    }

    // Cancel request to PetPuja
    try {
      await cancelPetpujaOrder({
        restID: order.restaurantid,
        client_order_id: clientorderID,
        cancel_reason: reason,
      })
    } catch (err) {
      console.warn("PetPooja cancel failed:", err.message)
    }

    // Update Supabase status
await supabase
  .from("orders")
  .update({
    status: "CANCELLED",       // <-- THIS writes CANCELLED into DB
    refunded_amount: refundAmount,
    cancelledAt: new Date().toISOString(),
  })
  .eq("id", clientorderID);



    return res.json({
      success: true,
      message: "Order cancelled and refunded",
      amount: refundAmount,
    })
console.log(m);

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    })
  }
}

module.exports = { cancelOrder }
