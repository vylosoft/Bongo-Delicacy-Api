// payment.controller.js

const Razorpay = require("razorpay");
const env = require("../../config/env.js");
const crypto = require("crypto");

const { saveOrderSchema } = require("../validations/order.validation.js");
const { placeOrderWithPetpuja, cancelPetpujaOrder } = require("../helpers/petpujaHelper.js");
const { generateOrderId } = require("../../utils/generateOrderId.js");
 const { fetchUserPreferences } = require("../helpers/serPreferencesHelper.js");   
const { createClient } = require("@supabase/supabase-js");

// Hardcoded because you asked
const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY"
);

/* -------------------------------------------------------
   CREATE ORDER
------------------------------------------------------- */
const createOrder = async (req, res) => {
  // Step 1: Validate incoming request
  const { error, value } = saveOrderSchema(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(e => e.message),
    });
  }

  const data = value.orderinfo.OrderInfo;
  const orderDetails = data.Order.details;
  const restaurantDetails = data.Restaurant.details;
  const orderItems = data.OrderItem.details;
  const userId = value.userId; // Extract userId

  const clientorderID = generateOrderId();
  orderDetails.clientorderID = clientorderID;

  try {
    // Step 2: Fetch user preferences and feedback (if userId provided)
    let aiDescription = "";
    
    if (userId) {
      console.log(`Fetching preferences for user: ${userId}`);
      
      const userPreferences = await fetchUserPreferences(userId);
      
      console.log("User Preferences:", userPreferences);

      // Step 3: Generate AI description
      const restaurantName = restaurantDetails.restName || 
                            restaurantDetails.name || 
                            "Restaurant";

      console.log("Generating AI description...");
      
      aiDescription = await generateOrderDescription(
        userPreferences,
        orderItems,
        restaurantName
      );

      console.log("AI Generated Description:", aiDescription);

      // Step 4: Add description to order details
      orderDetails.description = aiDescription;
    } else {
      console.log("No userId provided, skipping AI description");
    }

    // Step 5: Place order with PetPooja (now includes description)
    console.log("Placing order with PetPooja...");
    
    await placeOrderWithPetpuja(req.body.orderinfo);
    
    console.log("PetPooja order placed successfully");

  } catch (err) {
    console.error("PetPooja Order Error:", err);
    return res.status(502).json({
      success: false,
      message: "Restaurant did not accept the order",
      error: err.message,
    });
  }

  try {
    // Step 6: Create Razorpay order
    const total = Number(orderDetails.total);
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    console.log("Creating Razorpay order...");

    const rpOrder = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: `pp_${clientorderID}`,
      notes: { 
        clientorderID, 
        restID: restaurantDetails.restID,
        userId: userId || "guest"
      },
    });

    console.log("Razorpay order created:", rpOrder.id);

    // Step 7: Save to Supabase
    await supabase.from("orders").insert([
      {
        clientorderid: clientorderID,
        restaurantid: restaurantDetails.restID,
        user_id: userId || null,
        razorpay_order_id: rpOrder.id,
        amount: total,
        status: "received",
        ai_generated_description: orderDetails.description || null,
      },
    ]);

    console.log("Order saved to database");

    // Step 8: Return success response
    return res.json({
      success: true,
      message: "Order created successfully",
      clientorderID,
      razorpayOrder: rpOrder,
      orderDescription: orderDetails.description || "No special instructions",
    });

  } catch (err) {
    console.error("Order Creation Error:", err);

    // Rollback: Cancel PetPooja order
    await cancelPetpujaOrder({
      restID: restaurantDetails.restID,
      clientorderID,
      cancelReason: "Payment initiation failed",
    });

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------------------------------------------
   VERIFY PAYMENT (unchanged)
------------------------------------------------------- */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      clientorderID,
    } = req.body;

    const secret = env.RAZORPAY_KEY_SECRET;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    await supabase
      .from("orders")
      .update({ status: "paid", razorpay_payment_id })
      .eq("clientorderid", clientorderID);

    return res.json({ success: true, message: "Payment verified" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
