const { createClient } = require("@supabase/supabase-js");
const {
  getMealRecommendation,
  parseMenuFromText,
} = require("../services/gemini.service");
const {
  getPersonalizedMealRecommendations,
} = require("../services/gemini.personalized");

/* ================== SUPABASE SETUP ================== */

const supabase = require("../../config/db");

/* ================== HELPERS ================== */

/**
 * Fetch latest menu payload from Supabase cache
 * Payload format is IDENTICAL to PetPooja response
 */
async function fetchMenuFromSupabase(identifier) {
  console.log("Fetching menu for identifier:", identifier);

  // Try menusharingcode first
  let { data, error } = await supabase
    .from("petpooja_menu_cache")
    .select("payload")
    .eq("rest_id", identifier)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Fallback: try restaurant_id
  if (!data) {
    ({ data, error } = await supabase
      .from("petpooja_menu_cache")
      .select("payload")
      .eq("rest_id", identifier)
      .order("created_at", { ascending: false })
      .limit(1)
      .single());
  }

  if (error) {
    console.error("Supabase error:", error);
  }

  if (!data?.payload) {
    throw new Error("Menu not found in Supabase cache");
  }

  return data.payload;
}


/**
 * Build AI-friendly flat menu
 * Handles ₹0 items with variations correctly
 */
function buildFlatMenu(items = []) {
  const flatMenu = [];

  items.forEach((item) => {
    const base = {
      itemId: String(item.itemid),
      name: item.itemname,
      description: item.itemdescription || "",
      categoryId: String(item.item_categoryid),
      // type: ATTRIBUTE_MAP[item.item_attributeid] || "unknown",
      image: item.item_image_url || "",
      hasAddons: item.itemallowaddon === "1",
      hasVariations: item.itemallowvariation === "1",
    };

    if (Array.isArray(item.variation) && item.variation.length > 0) {
      item.variation.forEach((v) => {
        flatMenu.push({
          ...base,
          variantId: String(v.id || v.variationid),
          variantName: v.name,
          price: Number(v.price),
          fullName: `${item.itemname} - ${v.name}`,
        });
      });
    } else {
      flatMenu.push({
        ...base,
        price: Number(item.price),
        fullName: item.itemname,
      });
    }
  });

  return flatMenu;
}

/**
 * Display price for frontend menu
 */
function getDisplayPrice(item) {
  if (item.price && Number(item.price) > 0) {
    return Number(item.price);
  }

  if (Array.isArray(item.variation) && item.variation.length > 0) {
    const prices = item.variation.map((v) => Number(v.price));
    return `From ₹${Math.min(...prices)}`;
  }

  return null;
}

/* ================== ADMIN / GENERIC RECOMMENDATION ================== */

const recommendDish = async (req, res) => {
  try {
    const { resturent_identifier, preferences = "" } = req.body;

    if (!resturent_identifier) {
      return res
        .status(400)
        .json({ error: "resturent_identifier is required" });
    }

    const menuData = await fetchMenuFromSupabase(resturent_identifier);

    const brandName =
      menuData.restaurant_name ||
      menuData.rest_name ||
      menuData.name ||
      menuData.restaurants?.[0]?.details?.restaurantname ||
      "Restaurant";

    const items = menuData.items || [];
    const categories = menuData.categories || [];

    const menuByCategory = categories.map((cat) => ({
      id: String(cat.categoryid),
      name: cat.categoryname,
      items: items
        .filter((i) => i.item_categoryid == cat.categoryid)
        .map((i) => ({
          id: String(i.itemid),
          name: i.itemname,
          description: i.itemdescription || "",
          price: getDisplayPrice(i),
          image: i.item_image_url || "",
          // type: ATTRIBUTE_MAP[i.item_attributeid] || "unknown",
          hasAddons: i.itemallowaddon === "1",
          hasVariations: i.itemallowvariation === "1",
        })),
    }));

    const flatMenu = buildFlatMenu(items);

    const recommendation = await getMealRecommendation(
      preferences,
      flatMenu,
      brandName,
    );

    return res.json({
      success: true,
      brandName,
      menu: menuByCategory,
      recommendation,
    });
  } catch (err) {
    console.error("ADMIN MENU ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* ================== USER-SPECIFIC RECOMMENDATION ================== */

const getUserRecommendations = async (req, res) => {
  try {
    const { userId, restaurantId } = req.body;

    if (!userId || !restaurantId) {
      return res
        .status(400)
        .json({ error: "userId and restaurantId are required" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("dietary_preferences")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const userPreferences = {
      likes: (profile.dietary_preferences?.likes || []).join(", "),
      dislikes: (profile.dietary_preferences?.dislikes || []).join(", "),
      allergies: (profile.dietary_preferences?.allergies || []).join(", "),
      feedback: "",
    };
    const { data: orderFeedback } = await supabase
      .from("orders")
      .select("feedback")
      .eq("user_id", userId)
      .not("feedback", "is", null);

    if (Array.isArray(orderFeedback)) {
      userPreferences.feedback = orderFeedback
        .map((o) => o.feedback)
        .filter(Boolean)
        .join(" | ");
    }

    const menuData = await fetchMenuFromSupabase(restaurantId);

    const brandName =
      menuData.restaurant_name ||
      menuData.rest_name ||
      menuData.name ||
      menuData.restaurants?.[0]?.details?.restaurantname ||
      "Restaurant";

    const flatMenu = buildFlatMenu(menuData.items || []);

    const aiRecommendation = await getPersonalizedMealRecommendations(
      userPreferences,
      "",
      flatMenu,
      brandName,
    );

    return res.json({
      success: true,
      userId,
      restaurantId,
      brandName,
      preferences: userPreferences,
      recommendation: aiRecommendation,
    });
  } catch (err) {
    console.error("USER RECOMMENDATION ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* ================== MENU PARSER ================== */

const parseMenu = async (req, res) => {
  try {
    const { text } = req.body;
    const result = await parseMenuFromText(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================== EXPORT ================== */

module.exports = {
  recommendDish,
  getUserRecommendations,
  parseMenu,
};