const { createClient } = require("@supabase/supabase-js");
const { getMealRecommendation, parseMenuFromText } = require("../services/gemini.service");
const { getPersonalizedMealRecommendations } = require("../services/gemini.personalized");
const { petpujaService } = require("../../utils/petpujaService");

// Load Supabase from environment variables
const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const recommendDish = async (req, res) => {
  try {
    const { resturent_identifier, preferences = "" } = req.body;

    if (!resturent_identifier) {
      return res.status(400).json({ error: "resturent_identifier is required" });
    }

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const responseData = await petpujaService(URI, { restID: resturent_identifier });

    console.log("PETPUJA RAW KEYS:", Object.keys(responseData));

    // Stronger restaurant name extraction
    const brandName =
      responseData?.restaurant_name ||
      responseData?.rest_name ||
      responseData?.restaurant ||
      responseData?.brand ||
      responseData?.outlet_name ||
      responseData?.name ||
      responseData?.store_name ||
      "Restaurant";

    const items = responseData?.items || [];
    const categories = responseData?.categories || [];

    // Build category list
    const menuByCategory = categories.map(cat => ({
      id: String(cat.categoryid),
      name: cat.categoryname,
      items: items
        .filter(i => i.item_categoryid == cat.categoryid)
        .map(i => ({
          id: String(i.itemid),
          name: i.itemname,
          description: i.itemdescription || "",
          price: i.price || null,
          image: i.item_image_url || ""
        }))
    }));

    // Flat menu for AI
    const flatMenu = items.map(i => ({
      id: String(i.itemid),
      name: i.itemname,
      description: i.itemdescription || "",
      price: i.price || null,
      image: i.item_image_url || ""
    }));

    console.log("MENU SENT TO GEMINI:", flatMenu.length);

    const recommendation = await getMealRecommendation(preferences, flatMenu, brandName);

    return res.json({
      brandName,
      menu: menuByCategory,
      recommendation // STRING ONLY
    });

  } catch (err) {
    console.error("ADMIN MENU ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



const getUserRecommendations = async (req, res) => {
  try {
    const { userId, restaurantId } = req.body;

    if (!userId || !restaurantId) {
      return res.status(400).json({ error: "userId and restaurantId are required" });
    }

    // 1) Fetch user taste profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("dietary_preferences")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const userPreferences = {
      likes: profile.dietary_preferences?.likes || "",
      dislikes: profile.dietary_preferences?.dislikes || "",
      allergies: profile.dietary_preferences?.allergies || "",
      feedback: ""
    };

    // 2) Collect feedback from orders table
    const { data: orderFeedback, error: orderError } = await supabase
      .from("orders")
      .select("feedback")
      .eq("user_id", userId)
      .not("feedback", "is", null);

    if (!orderError && Array.isArray(orderFeedback)) {
      userPreferences.feedback = orderFeedback
        .map(f => f.feedback)
        .filter(Boolean)
        .join(" | ");
    }

    // 3) Fetch menu
    const uri = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const menuData = await petpujaService(uri, { restID: restaurantId });

    if (!menuData || !menuData.items) {
      return res.status(500).json({ error: "Unable to fetch restaurant menu" });
    }

    const brandName =
      menuData.restaurant_name ||
      menuData.rest_name ||
      menuData.name ||
      "Restaurant";

    const flatMenu = menuData.items.map(i => ({
      id: i.itemid,
      name: i.itemname,
      description: i.itemdescription || "",
      price: i.price || null,
      image: i.item_image_url || ""
    }));

    // 4) Ask Gemini WITHOUT MESSAGE
    const aiRecommendation = await getPersonalizedMealRecommendations(
      userPreferences,
      "",        // NO MESSAGE SENT
      flatMenu,
      brandName
    );

    return res.json({
      success: true,
      userId,
      restaurantId,
      brandName,
      preferences: userPreferences,
      recommendation: aiRecommendation
    });

  } catch (err) {
    console.error("USER RECOMMENDATION ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};




const parseMenu = async (req, res) => {
  try {
    const { text } = req.body;
    const result = await parseMenuFromText(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  recommendDish,
  parseMenu,
  getUserRecommendations
};
