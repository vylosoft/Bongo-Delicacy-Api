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
    const { error: validationError, value } = saveOrderSchema(req.body);
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
      orderinfo,                // ✅ save full orderinfo so verifyPayment can use it for PetPooja
      items: normalizedItems,
      customer: customerDetails,
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    console.log("[CREATE_ORDER] Inserting order into DB");

    const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      console.error("[CREATE_ORDER] Supabase insert failed:", error);
      return res.error({
        message: `Oops! We're having some technical trouble. If your payment went through, please give us a shout and we'll make things right!`,
        status: 400
      });
    }

    // ⛔ PetPooja is NOT called here anymore.
    // ✅ It will only be called after payment is verified in verifyPayment()

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
   VERIFY PAYMENT + UPDATE DB ORDER + NOTIFY PETPOOJA
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

  /* ================== VERIFY SIGNATURE ================== */
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

    // Mark order as PAYMENT_FAILED in DB
    await supabase
      .from("orders")
      .update({ status: "PAYMENT_FAILED" })
      .eq("id", clientorderID);

    return res.status(400).json({ success: false, message: "Payment verification failed." });
  }

  console.log("[VERIFY_PAYMENT] Signature verified ✅");

  try {
    const { brandId, restaurantName, userId, items, customer, deliveryAddress, pricing } = orderData;

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

    console.log("[VERIFY_PAYMENT] Updating order in DB");
    const { error } = await supabase.from("orders").update(orderRow).eq("id", clientorderID);

    if (error) {
      console.error("[VERIFY_PAYMENT] Supabase update failed:", error);
      throw error;
    }

    console.log("[VERIFY_PAYMENT] Order updated successfully ✅");

    /* ================== PETPOOJA — only after payment confirmed ================== */
    // Fetch the saved orderinfo from DB (stored during createOrder)
    const { data: savedOrder, error: fetchError } = await supabase
      .from("orders")
      .select("orderinfo")
      .eq("id", clientorderID)
      .single();

    if (fetchError || !savedOrder?.orderinfo) {
      console.error("[VERIFY_PAYMENT] Failed to fetch orderinfo for PetPooja:", fetchError);
      // Order is paid & saved — still return success, but log for manual retry
      return res.json({ success: true, warning: "Order received but PetPooja notification failed. Please contact support." });
    }

    try {
      console.log("[VERIFY_PAYMENT] Sending order to PetPooja ✅");
      await placeOrderWithPetpuja(savedOrder.orderinfo);
      console.log("[VERIFY_PAYMENT] PetPooja order placed ✅");
    } catch (err) {
      console.error("[VERIFY_PAYMENT] PetPooja order failed:", err);
      // Payment is done, so don't fail the response — alert the restaurant instead
      return res.json({ success: true, warning: "Payment received but restaurant notification failed. Please contact the restaurant." });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error("[VERIFY_PAYMENT] Order processing failed:", err);

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

    // Also update DB status
    await supabase
      .from("orders")
      .update({ status: "PAYMENT_FAILED" })
      .eq("id", clientorderID);

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