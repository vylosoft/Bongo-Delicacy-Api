const Razorpay = require("razorpay");
const crypto = require("crypto");
const env = require("../../config/env.js");
const { createDeliveryTaskFromOrder } = require("../helpers/riderHelper");
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

const { createClient } = require("@supabase/supabase-js");

const supabase = require("../../config/db");
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
  console.log("[CREATE_ORDER] Incoming request");

  const { error, value } = saveOrderSchema(req.body);
  if (error) {
    console.error("[CREATE_ORDER] Validation failed:", error);
    return res.status(400).json({ success: false });
  }

  const { orderinfo, userId } = value;

  const orderDetails = orderinfo.OrderInfo.Order.details;
  const restaurantDetails = orderinfo.OrderInfo.Restaurant.details;
  const orderItems = orderinfo.OrderInfo.OrderItem?.details || [];

  const clientorderID = generateOrderId();
  orderDetails.orderID = clientorderID;
  orderDetails.clientorderID = clientorderID;

  console.log("[CREATE_ORDER] Generated clientorderID:", clientorderID);

  /* ================== DESCRIPTION ================== */
  try {
    if (userId) {
      console.log("[CREATE_ORDER] Fetching user preferences:", userId);

      const prefs = await fetchUserPreferences(userId);
      console.log("[DEBUG PREFS]", prefs);

      const pastItemFeedback = await fetchRelevantOrderFeedback(
        supabase,
        userId,
        orderItems
      );

      console.log(
        "[CREATE_ORDER] Past feedback count:",
        pastItemFeedback.length
      );

      console.log("[CREATE_ORDER] Generating AI description");

      const aiResult = await generateOrderDescription(
        prefs,
        orderItems,
        pastItemFeedback
      );

      orderDetails.description =
        typeof aiResult === "string"
          ? aiResult
          : aiResult?.description || "";

      console.log(
        "[CREATE_ORDER] AI description length:",
        orderDetails.description.length
      );
    } else {
      orderDetails.description = "";
      console.log("[CREATE_ORDER] No userId, description skipped");
    }
  } catch (err) {
    console.error("[CREATE_ORDER] AI description failed:", err);
    orderDetails.description = "";
  }

  /* ================== RAZORPAY ================== */
  // ✅ PetPooja is NOT called here anymore — it's called after payment success
  try {
    console.log("[CREATE_ORDER] Creating Razorpay order");

    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const rpOrder = await razorpay.orders.create({
     amount: Math.round(Number(orderDetails.total) * 100),
      currency: "INR",
      receipt: `pp_${clientorderID}`,
    });

    console.log("[CREATE_ORDER] Razorpay order created:", rpOrder.id);

    // Return orderinfo back to frontend so it can be sent in verifyPayment
    return res.json({
      success: true,
      clientorderID,
      razorpayOrder: rpOrder,
      orderinfo, // ✅ frontend must send this back in verifyPayment body
    });
  } catch (err) {
    console.error("[CREATE_ORDER] Razorpay creation failed:", err);

    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
    });
  }
};

/* -------------------------------------------------------
   VERIFY PAYMENT + PLACE PETPOOJA ORDER + CREATE DB ORDER
------------------------------------------------------- */
const verifyPayment = async (req, res) => {
  console.log("[VERIFY_PAYMENT] Incoming request");

  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    clientorderID,
    orderData,
    orderinfo, // ✅ same orderinfo from createOrder response — no changes to its structure
  } = req.body;

  /* ================== SIGNATURE CHECK ================== */
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

    return res.status(400).json({ success: false });
  }

  console.log("[VERIFY_PAYMENT] Signature verified");

  /* ================== PETPOOJA ================== */
  // ✅ Called here after payment is confirmed — same data, no changes
  try {
    console.log("[VERIFY_PAYMENT] Placing order on PetPooja");
    await placeOrderWithPetpuja(orderinfo);
    console.log("[VERIFY_PAYMENT] PetPooja order placed successfully");
  } catch (err) {
    console.error("[VERIFY_PAYMENT] PetPooja order failed:", err);
    return res.status(502).json({
      success: false,
      message: "PetPooja order failed after payment",
    });
  }

  /* ================== DB INSERT ================== */
  try {
// ✅ FIXED - destructure restaurantName too
const { brandId, restaurantName, userId, items, customer, deliveryAddress, pricing } = orderData;
    const normalizedItems = items.map(normalizeOrderItem);

    const pointsEarned = Math.floor(pricing.total_amount / 100);

    const orderRow = {
      id: clientorderID,
      brand_id: brandId,
      user_id: userId,
      restaurant_name: restaurantName,
      items: normalizedItems,
      customer,
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
      refund_id: razorpay_payment_id,
      created_at: new Date().toISOString(),
    };

    console.log("[VERIFY_PAYMENT] Inserting order into DB");

    const { error } = await supabase.from("orders").insert(orderRow);

    if (error) {
      console.error("[VERIFY_PAYMENT] Supabase insert failed:", error);
      throw error;
    }

    console.log("[VERIFY_PAYMENT] Order saved successfully");



setTimeout(async () => {
  try {
    console.log("🚀 Auto booking rider...");

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", clientorderID)
      .single();

    if (!order) {
      console.log("❌ Order not found");
      return;
    }

    if (order.delivery_info?.taskId) {
      console.log("⚠️ Rider already booked");
      return;
    }

    const otp = crypto.randomInt(1000, 10000).toString();

    const riderResp = await createDeliveryTaskFromOrder({
      ...order,
      otp,
      resturent_lat: order.delivery_address.coordinates.lat,
      resturent_lang: order.delivery_address.coordinates.lng,
      resturent_name: order.restaurant_name,
      resturent_number: order.customer.phone,
      resturent_address: order.delivery_address.fullAddress,
      resturent_city: order.delivery_address.landmark || "city",
    });

    if (!riderResp.success) {
      console.log("❌ Rider booking failed:", riderResp.error);
      return;
    }

    await supabase
      .from("orders")
      .update({
        delivery_info: {
          taskId: riderResp.data.taskId,
          status_code: riderResp.data.Status_code,
          otp,
        },
      })
      .eq("id", order.id);

    console.log("✅ Rider booked:", riderResp.data.taskId);

  } catch (err) {
    console.error("🔥 Rider error:", err.message);
  }
}, 5000);

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