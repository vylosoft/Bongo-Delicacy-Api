const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");

const { saveOrderSchema } = require("../validations/order.validation.js");
const {
  placeOrderWithPetpuja,
  cancelPetpujaOrder,
} = require("../helpers/petpujaHelper.js");

const { generateOrderId } = require("../../utils/generateOrderId.js");
const { fetchUserPreferences, fetchRelevantOrderFeedback } = require("../helpers/serPreferencesHelper.js");
const {
  generateOrderDescription,
} = require("../services/gemini.orderEnhancer.js");


const supabase = require("../../config/db");
const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });

const normalizeOrderItem = (item) => {
  const basePrice = Number(item.base_price ?? item.price ?? 0);
  const gstAmount = Number(item.gst_total_amount ?? 0);

  return {
    id: item.itemid,
    itemid: item.itemid,
    name: item.itemname,
    itemname: item.itemname,

    price: basePrice.toFixed(2),
    base_price: basePrice,
    price_with_gst: basePrice + gstAmount,

    quantity: item.quantity ?? 1,

    addon: [],
    variation: [],

    gst_type: item.gst_type ?? "services",
    gst_total_percentage: item.gst_total_percentage ?? 0,
    gst_total_amount: gstAmount,

    tax_breakup: item.tax_breakup ?? [],
    item_tax: item.item_tax ?? [],
    tax_inclusive: Boolean(item.tax_inclusive),

    active: item.active ?? "1",
    in_stock: item.in_stock ?? "1",
    is_combo: item.is_combo ?? "0",

    itemdescription: item.itemdescription ?? "",
    item_categoryid: item.item_categoryid ?? "",
    itemrank: item.itemrank ?? "1",

    item_image_url: item.item_image_url ?? "",
    image: item.image ?? item.item_image_url ?? "",

    item_info: item.item_info ?? { spice_level: "not-applicable" },

    cuisine: item.cuisine ?? [],
    item_tags: item.item_tags ?? [],

    itemallowaddon: item.itemallowaddon ?? "0",
    itemallowvariation: item.itemallowvariation ?? "0",
    itemaddonbasedon: item.itemaddonbasedon ?? "0",

    item_favorite: item.item_favorite ?? "0",
    ignore_taxes: item.ignore_taxes ?? "0",
    ignore_discounts: item.ignore_discounts ?? "0",

    item_ordertype: item.item_ordertype ?? "1,2,3",
    item_packingcharges: item.item_packingcharges ?? "0",
    variation_groupname: item.variation_groupname ?? "",
    minimumpreparationtime: item.minimumpreparationtime ?? "",
  };
};

/* -------------------------------------------------------
   CREATE ORDER
------------------------------------------------------- */
const createOrder = async (req, res) => {
  try {
    const { error : validationError, value } = saveOrderSchema(req.body);
    if (validationError) {
      return res.error({
        message: validationError.details.map((e) => e.message).join(", "),
        status: 400
      });
    }
  
    const { orderinfo, userId } = value;

    const orderDetails = orderinfo.OrderInfo.Order.details;
    const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;
    const orderItems = orderinfo.OrderInfo.OrderItem?.details || [];

    const clientorderID = generateOrderId();
    orderDetails.orderID = clientorderID;
    orderDetails.clientorderID = clientorderID;
    orderDetails.description = "";
    const customerDetails = orderinfo.OrderInfo.Customer.details;
    let razorPayResponse = null;

    /**
     * Generate AI response to get insight.
     */
    if (userId) {
      try {
        const [prefs, pastItemFeedback] = await Promise.all([
          fetchUserPreferences(userId),
          fetchRelevantOrderFeedback(supabase, userId, orderItems)
        ]);
        console.log("prefs::", prefs);
        console.log("pastItemFeedback", pastItemFeedback);

        const aiResult = await generateOrderDescription(prefs, orderItems, pastItemFeedback);

        orderDetails.description = typeof aiResult === "string" ? aiResult : aiResult?.description || "";
      } catch (e) {
        console.log("AI result error:: ", e);
      }
    }

    /* ================== RAZORPAY ================== */
    try {
      razorPayResponse = await razorpay.orders.create({
        amount: Number(orderDetails.total) * 100,
        currency: "INR",
        receipt: `pp_${clientorderID}`
      });
    } catch (error) {
      console.log(error);
      return res.error({
        message: "Payment failed.",
        status: 400
      });
    }

    /* =============== Store in bongo delicacy database ===============*/

    const normalizedItems = orderItems.map(normalizeOrderItem);
    const orderRow = {
      id: clientorderID,
      brand_id: restaurantDetails.restID,
      user_id: userId,
      items: normalizedItems,
      customer: customerDetails,
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    console.log("[VERIFY_PAYMENT] Inserting order into DB");

    const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      console.error("[VERIFY_PAYMENT] Supabase insert failed:", error);
      return res.error({
        message: `Oops! We’re having some technical trouble. If your payment went through, please give us a shout and we’ll make things right!`,
        status: 400
      });
    }
    /* ================== PETPOOJA ================== */
    try {
      console.log("[CREATE_ORDER] Sending order to PetPooja");
      await placeOrderWithPetpuja(orderinfo);
      console.log("[CREATE_ORDER] PetPooja order placed");
    } catch (err) {
      console.error("[CREATE_ORDER] PetPooja order failed:", err);
      return res.status(502).json({
        success: false,
        message: "Internal issue occured. Please contact resturent.",
      });
    }
     return res.json({
       success: true,
       clientorderID,
       razorpayOrder: razorPayResponse
     });

  } catch (error) {
    return res.error({
      message: "Internal server error.",
      status: 500
    });
  }
};

/* -------------------------------------------------------
   VERIFY PAYMENT + CREATE DB ORDER
------------------------------------------------------- */
const verifyPayment = async (req, res) => {
  console.log("[VERIFY_PAYMENT] Incoming request");

  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    clientorderID,
    orderData,
  } = req.body;

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    console.error("[VERIFY_PAYMENT] Signature mismatch", {
      expected,
      received: razorpay_signature,
    });

    try {
      await cancelPetpujaOrder({
        restID: orderData.brandId,
        clientorderID,
        cancelReason: "Signature mismatch",
      });
    } catch (err) {
      console.error("[VERIFY_PAYMENT] Failed to cancel PetPooja:", err);
    }

    return res.status(400).json({ success: false });
  }

  console.log("[VERIFY_PAYMENT] Signature verified");

  try {
    const { brandId, userId, items, customer, deliveryAddress, pricing } =
      orderData;
    // 🔐 Optional but recommended safety check
    // if (pricing.total_amount * 100 !== Number(req.body.razorpay_amount)) {
    //   throw new Error("Amount mismatch detected");
    // }

    const pointsEarned = Math.floor(pricing.total_amount / 100);

    const orderRow = {
      restaurant_name: restaurantName,
      delivery_address: deliveryAddress,

      subtotal: pricing.subtotal,
      discount_amount: pricing.flat_discount,
      loyalty_discount: pricing.loyalty_discount,
      gst_amount: pricing.gst_amount,
      delivery_charge: pricing.delivery_charge,
      total_amount: pricing.total_amount,

      points_earned: pointsEarned,
      status: "RECEIVED",
      external_order_id: razorpay_order_id,
      refund_id: razorpay_payment_id
    };

    console.log("[VERIFY_PAYMENT] Inserting order into DB");
    const { error } = await supabase.from("orders").update(orderRow).eq("id", clientorderID);
    //const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      console.error("[VERIFY_PAYMENT] Supabase insert failed:", error);
      throw error;
    }

    console.log("[VERIFY_PAYMENT] Order saved successfully");

    return res.json({ success: true });
  } catch (err) {
    console.error("[VERIFY_PAYMENT] Order processing failed:", err);

    try {
      await cancelPetpujaOrder({
        restID: orderData.brandId,
        clientorderID,
        cancelReason: "DB insert failed",
      });
    } catch (cancelErr) {
      console.error("[VERIFY_PAYMENT] Failed to cancel PetPooja:", cancelErr);
    }

    return res.status(500).json({ success: false });
  }
};

/* -------------------------------------------------------
   CANCEL ON PAYMENT FAILURE
------------------------------------------------------- */
const cancelOrderOnPaymentfailed = async (req, res) => {
  console.log("[CANCEL_ORDER] Incoming request", req.body);

  const { restID, clientorderID, cancelReason } = req.body;

  try {
    await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason,
    });

    console.log("[CANCEL_ORDER] Order cancelled successfully");

    return res.json({ success: true });
  } catch (err) {
    console.error("[CANCEL_ORDER] Cancellation failed:", err);
    return res.status(500).json({ success: false });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
};
