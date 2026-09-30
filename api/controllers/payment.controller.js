const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");

const { saveOrderSchema } = require("../validations/order.validation.js");

const {
  placeOrderWithPetpuja,
  cancelPetpujaOrder,

} = require("../helpers/petpujaHelper.js");


const { generateOrderId } = require("../../utils/generateOrderId.js");
const {
  fetchUserPreferences,
  fetchRelevantOrderFeedback,
} = require("../helpers/serPreferencesHelper.js");
const {
  generateOrderDescription,
} = require("../services/gemini.orderEnhancer.js");

const supabase = require("../../config/db");

/* =======================================================
   🔥 EXACT ERROR LOGGER (RAW + JSON)
======================================================= */
const logError = (label, err) => {
  console.error(`\n🔥 ===== ${label} =====`);

  // RAW (Node object)
  console.error("👉 RAW ERROR:");
  console.error(err);

  // JSON (Exact structure)
  console.error("👉 JSON ERROR:");
  console.error(JSON.stringify(err, null, 2));

  // Individual fields
  console.error("👉 CODE:", err?.code);
  console.error("👉 MESSAGE:", err?.message);
  console.error("👉 DETAILS:", err?.details);
  console.error("👉 HINT:", err?.hint);

  // Deep inspect
  console.dir(err, { depth: null });

  console.error("🔥 ==============================\n");
};

/* =======================================================
   NORMALIZE ITEM
======================================================= */
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

/* =======================================================
   CREATE ORDER
======================================================= */
const createOrder = async (req, res) => {
  try {
    console.log("[CREATE_ORDER] Incoming request");

    const { error, value } = saveOrderSchema(req.body);
    if (error) {
      logError("VALIDATION FAILED", error);
      return res.status(400).json({ success: false });
    }

    const { orderinfo, userId } = value;
    const orderDetails = orderinfo.OrderInfo.Order.details;
    const orderItems = orderinfo.OrderInfo.OrderItem?.details || [];

    const clientorderID = generateOrderId();
    orderDetails.orderID = clientorderID;
    orderDetails.clientorderID = clientorderID;

    console.log("[CREATE_ORDER] Generated ID:", clientorderID);

    /* ===== AI DESCRIPTION ===== */
    try {
      if (userId) {
        const prefs = await fetchUserPreferences(userId);
        const feedback = await fetchRelevantOrderFeedback(
          supabase,
          userId,
          orderItems,
        );

        const aiResult = await generateOrderDescription(
          prefs,
          orderItems,
          feedback,
        );

        orderDetails.description =
          typeof aiResult === "string" ? aiResult : aiResult?.description || "";
      } else {
        orderDetails.description = "";
      }
    } catch (err) {
      logError("AI DESCRIPTION FAILED", err);
    }

    /* ===== RAZORPAY ===== */
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const rpOrder = await razorpay.orders.create({
      amount: Math.round(Number(orderDetails.total) * 100),
      currency: "INR",
      receipt: `pp_${clientorderID}`,
    });

    console.log("[CREATE_ORDER] Razorpay order:", rpOrder.id);

    return res.json({
      success: true,
      clientorderID,
      razorpayOrder: rpOrder,
      orderinfo,
      key: env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    logError("CREATE ORDER FAILED", err);
    return res.status(500).json({ success: false });
  }
};

/* =======================================================
   VERIFY PAYMENT
======================================================= */
const verifyPayment = async (req, res) => {
  try {
    console.log("[VERIFY_PAYMENT] Start");

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      clientorderID,
      orderData,
      orderinfo,
    } = req.body;

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      console.error("❌ Signature mismatch");
      return res.status(400).json({ success: false });
    }

    console.log("✅ Payment verified");

    /* ===== PETPOOJA ===== */
    await placeOrderWithPetpuja(orderinfo);
    console.log("✅ PetPooja order placed");

    /* ===== DB INSERT ===== */
    const {
      brandId,
      restaurantName,
      userId,
      items,
      customer,
      deliveryAddress,
      pricing,
    } = orderData;

    const pointsEarned = Math.floor(pricing.total_amount / 100);
    const orderRow = {
      id: clientorderID,
      brand_id: brandId,
      user_id: userId,
      restaurant_name: restaurantName,
      items: items.map(normalizeOrderItem),
      customer,
      delivery_address: deliveryAddress,
      pickup_details: orderData.pickup_details ?? null,
      subtotal: pricing.subtotal,
      discount_amount: pricing.flat_discount,
      loyalty_discount: pricing.loyalty_discount,
      gst_amount: pricing.gst_amount,
      delivery_charge: pricing.delivery_charge,
      total_amount: pricing.total_amount,
      points_earned: pointsEarned,
      status: "RECEIVED",
      external_order_id: razorpay_order_id,
      refund_id: razorpay_payment_id,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      logError("SUPABASE INSERT FAILED", error);
      throw error;
    }

    console.log("✅ Order saved");


    /* ===== RIDER FLOW ===== */
 

    return res.json({ success: true });
  } catch (err) {
    logError("VERIFY PAYMENT FAILED", err);

    try {
      await cancelPetpujaOrder({
        restID: req.body?.orderData?.brandId,
        clientorderID: req.body?.clientorderID,
        cancelReason: "Failure after payment",
      });
    } catch (cancelErr) {
      logError("PETPOOJA CANCEL FAILED", cancelErr);
    }

    return res.status(500).json({ success: false });
  }
};

/* =======================================================
   CANCEL ORDER
======================================================= */
const cancelOrderOnPaymentfailed = async (req, res) => {
  try {
    console.log("[CANCEL_ORDER]", req.body);

    const { restID, clientorderID, cancelReason } = req.body;

    await cancelPetpujaOrder({
      restID,
      clientorderID,
      cancelReason,
    });

    return res.json({ success: true });
  } catch (err) {
    logError("CANCEL ORDER FAILED", err);
    return res.status(500).json({ success: false });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelOrderOnPaymentfailed,
};
