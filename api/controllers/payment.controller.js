const Razorpay = require("razorpay");
const env = require("../../config/env.js");
const { saveOrderSchema } = require("../validations/order.validation.js");
const { placeOrderWithPetpuja, cancelPetpujaOrder } = require("../helpers/petpujaHelper.js");
const { generateOrderId } = require("../../utils/generateOrderId.js");

/**
 * CREATE ORDER
 * Flow:
 * 1) Validate payload
 * 2) Generate clientorderID (A-123)
 * 3) Call PetPooja save_order
 * 4) Create Razorpay order
 * 5) If Razorpay fails → cancel PetPooja order
 */
const createOrder = async (req, res) => {
  // Step 1: Validate request body with Joi
  const { error, value } = saveOrderSchema(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map(e => e.message)
    });
  }

  // Joi cleaned payload
  const data = value;
  const orderinfo = data.orderinfo;
  const orderDetails = orderinfo.OrderInfo.Order.details;
  const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;

  // Step 2: Generate order ID (clientorderID)
  const clientorderID = generateOrderId();
  orderDetails.orderID = clientorderID;        // internal reference
  orderDetails.clientorderID = clientorderID;  // PetPooja tracking

  // Step 3: Hit PetPooja save_order API
  let petpujaResponse;
  try {
    petpujaResponse = await placeOrderWithPetpuja(orderinfo);
  } catch (err) {
    return res.status(err.statusCode || 502).json({
      success: false,
      message: "Could not create order in PetPooja",
      error: err.details || err.message
    });
  }

  // Step 4: Create Razorpay order
  try {
    const total = Number(orderDetails.total);
    if (Number.isNaN(total)) {
      throw new Error("Invalid order total");
    }

    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });

    const rpOrder = await razorpay.orders.create({
      amount: total * 100,           // rupees → paise
      currency: "INR",
      receipt: `pp_${clientorderID}`,
      notes: {
        restID: restaurantDetails.restID,
        clientorderID
      }
    });

    // TODO: Save data to supabase/db here with status: "created"

    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      clientorderID,
      petpujaOrder: petpujaResponse,
      razorpayOrder: rpOrder
    });
  } catch (error) {
    // Step 5: Razorpay failed → cancel PetPooja order
    try {
      await cancelPetpujaOrder({
        restID: restaurantDetails.restID,
        clientorderID,
        cancelReason: "Payment failed"
      });
    } catch (cancelErr) {
      console.error("PetPooja cancellation failed:", cancelErr);
    }

    return res.status(500).json({
      success: false,
      message: "Payment setup failed; order cancelled",
      error: error.message
    });
  }
};

/**
 * HANDLE PAYMENT RESPONSE
 * status === success → acknowledge
 * status !== success → cancel PetPooja order
 */
const handlePaymentResponse = async (req, res) => {
  try {
    const { status, restID, clientorderID } = req.body;

    if (!restID || !clientorderID) {
      return res.status(400).json({
        success: false,
        message: "restID and clientorderID are required"
      });
    }

    if (status === "success") {
      // TODO: update DB order status → paid
      return res.status(200).json({
        success: true,
        message: "Payment successful"
      });
    }

    // Payment failed → cancel order in PetPooja
    const cancelResp = await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason: "Payment failed"
    });

    // TODO: update DB order status → cancelled

    return res.status(400).json({
      success: false,
      message: "Payment failed; order cancelled",
      petpuja: cancelResp
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error processing payment response",
      error: err.message
    });
  }
};

module.exports = {
  createOrder,
  handlePaymentResponse
};
