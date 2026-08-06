const supabase = require("../../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ==========================================================
   ALLERGY KEYWORDS (fast path — checked first, no AI call)
   Keys match the allergy option ids used by the frontend quiz.
   ========================================================== */
const ALLERGY_KEYWORDS = {
  nuts: ["nut", "nuts", "cashew", "peanut", "almond", "pistachio", "walnut"],
  dairy: ["dairy", "milk", "cheese", "butter", "cream", "paneer", "ghee", "yogurt", "curd"],
  gluten: ["gluten", "wheat", "flour", "maida", "bread", "naan", "roti", "paratha"],
  eggs: ["egg", "eggs", "omelette", "omelet"],
  shellfish: ["shellfish", "prawn", "shrimp", "crab", "lobster", "oyster"],
  soy: ["soy", "soya", "soybean", "tofu", "edamame"],
};

/* ==========================================================
   In-memory cache: ingredient name (lowercased) -> Set of
   allergy ids Gemini determined it commonly contains.
   Avoids re-calling the AI for the same ingredient repeatedly
   across requests within this server's lifetime.
   ========================================================== */
const aiAllergenCache = new Map();

/**
 * Ask Gemini whether an ingredient commonly contains a given allergen.
 * Only called as a FALLBACK — when the keyword list doesn't recognize
 * the ingredient name at all for any tracked allergy.
 */
const checkIngredientWithAI = async (ingredientName, allergyIds) => {
  const cacheKey = ingredientName.toLowerCase().trim();
  if (aiAllergenCache.has(cacheKey)) {
    return aiAllergenCache.get(cacheKey);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[QuizResults] GEMINI_API_KEY not set — skipping AI allergen fallback");
    const empty = new Set();
    aiAllergenCache.set(cacheKey, empty);
    return empty;
  }

  try {
    const prompt =
      `For the food ingredient "${ingredientName}", which of these allergens does it commonly contain: ` +
      `${allergyIds.join(", ")}? ` +
      `Respond with ONLY a comma-separated list of the matching allergen ids from that exact list ` +
      `(e.g. "dairy,gluten"), or the single word "none" if it contains none of them. No other text, no markdown.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.1 },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().toLowerCase();

    const matched = new Set(
      text === "none"
        ? []
        : text.split(",").map((s) => s.trim()).filter((id) => allergyIds.includes(id)),
    );

    aiAllergenCache.set(cacheKey, matched);
    return matched;
  } catch (err) {
    console.error("[QuizResults] Gemini allergen check failed for", ingredientName, err.message);
    const empty = new Set();
    aiAllergenCache.set(cacheKey, empty);
    return empty;
  }
};

/**
 * Returns true if `ingredientName` matches any of the given active allergy ids,
 * using the keyword list first and falling back to AI only when the keyword
 * list has zero opinion on this ingredient (didn't match ANY known keyword).
 */
const ingredientMatchesAnyAllergyKeyword = (ingredientName, activeAllergies) => {
  const lower = ingredientName.toLowerCase();
  for (const allergyId of activeAllergies) {
    const keywords = ALLERGY_KEYWORDS[allergyId] || [];
    if (keywords.some((kw) => lower.includes(kw))) return true;
  }
  return false;
};

const ingredientIsRecognizedByKeywords = (ingredientName) => {
  const lower = ingredientName.toLowerCase();
  return Object.values(ALLERGY_KEYWORDS)
    .flat()
    .some((kw) => lower.includes(kw));
};

/* ==========================================================
   Check if a dish (by its recipeIngredients) is safe given the
   active allergy filters. Uses keyword-first, AI-fallback-only-
   for-unrecognized-ingredients strategy.
   ========================================================== */
const isDishSafeForAllergies = async (recipeIngredients, activeAllergies) => {
  if (!activeAllergies || activeAllergies.length === 0) return true;
  if (!Array.isArray(recipeIngredients) || recipeIngredients.length === 0) return true;

  for (const ing of recipeIngredients) {
    const name = ing?.item?.name;
    if (!name) continue;

    // Fast path: keyword list matches directly -> unsafe
    if (ingredientMatchesAnyAllergyKeyword(name, activeAllergies)) {
      return false;
    }

    // Keyword list recognizes this ingredient for OTHER allergens but not
    // the active ones -> no need for AI, it's just not a match.
    if (ingredientIsRecognizedByKeywords(name)) {
      continue;
    }

    // Keyword list has NO opinion at all on this ingredient -> AI fallback
    const aiMatches = await checkIngredientWithAI(name, activeAllergies);
    if (aiMatches.size > 0) {
      return false;
    }
  }

  return true;
};

/* ==========================================================
   Fetch currently-open outlets (reuses the same open/closed
   logic as brand.controller.js's getBrandsWithOutlet)
   ========================================================== */
const IST_OFFSET_MIN = 5 * 60 + 30;
const getNowIST = () => {
  const now = new Date();
  const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % (24 * 60);
  const istDay = new Date(now.getTime() + IST_OFFSET_MIN * 60000).getUTCDay();
  return { istDay, istMin };
};
const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const isOpenNow = (timingRows, isActive) => {
  if (!isActive) return false;
  if (!timingRows || timingRows.length === 0) return true;
  const { istDay, istMin } = getNowIST();
  const todaySlots = timingRows.filter(
    (r) => Number(r.day_of_week) === istDay && r.is_closed !== true && r.is_closed !== "true",
  );
  for (const slot of todaySlots) {
    const open = toMin(slot.open_time);
    const close = toMin(slot.close_time);
    if (close < open) {
      if (istMin >= open || istMin < close) return true;
    } else {
      if (istMin >= open && istMin < close) return true;
    }
  }
  return false;
};

const getOpenOutlets = async () => {
  const { data: outlets, error: outletError } = await supabase
    .from("outlet")
    .select("id, brand_id, is_active, petpooja_outlet_id, resturent_id, name, city, contact, address")
    .not("brand_id", "is", null);

  if (outletError) throw outletError;

  // Pull brand names separately and merge in — outlet.name is the specific
  // location's name, brands.brand_name is the actual brand (e.g. "Banglar
  // Jhale Jhole"), which is what should be shown to the customer.
  const brandIds = [...new Set((outlets || []).map((o) => o.brand_id).filter(Boolean))];
  let brandNameById = new Map();
  if (brandIds.length > 0) {
    const { data: brands, error: brandsError } = await supabase
      .from("brands")
      .select("id, brand_name")
      .in("id", brandIds);
    if (brandsError) {
      console.error("[QuizResults] brands fetch failed — falling back to outlet.name only:", brandsError.message);
    } else {
      brandNameById = new Map((brands || []).map((b) => [b.id, b.brand_name]));
    }
  }

  const outletsWithBrand = (outlets || []).map((o) => ({
    ...o,
    brand_name: brandNameById.get(o.brand_id) || o.name,
  }));

  const outletIds = outletsWithBrand.map((o) => o.id);
  let timingRowsRaw = [];
  if (outletIds.length > 0) {
    const { data: timingsData } = await supabase
      .from("outlet_timings")
      .select("outlet_id, day_of_week, open_time, close_time, is_closed")
      .in("outlet_id", outletIds);
    timingRowsRaw = timingsData || [];
  }

  const timingsByOutlet = {};
  for (const row of timingRowsRaw) {
    (timingsByOutlet[row.outlet_id] ||= []).push(row);
  }

  return outletsWithBrand.filter((o) => isOpenNow(timingsByOutlet[o.id], o.is_active));
};

/* ==========================================================
   MAIN: fetch quiz-filtered menu items across ALL open outlets,
   safe for the active allergy filters, paginated 5 at a time.
   ========================================================== */
exports.fetchQuizResults = async (req, res) => {
  try {
    const {
      cuisine_tag,
      mood_tag,
      allergies = [],
      page = 1,
      per_page = 5,
    } = req.body;

    const activeAllergies = Array.isArray(allergies) ? allergies : [];

    // 1. Which outlets are open right now?
    const openOutlets = await getOpenOutlets();
    if (openOutlets.length === 0) {
      return res.success({ data: { result: [], count: 0, page: Number(page), per_page: Number(per_page) } });
    }

    const restIds = openOutlets.map((o) => o.petpooja_outlet_id).filter(Boolean);
    const outletByRestId = new Map(openOutlets.map((o) => [o.petpooja_outlet_id, o]));

    // 2. Menu items across those outlets matching cuisine/mood tags
    let itemQuery = supabase
      .from("menu_items")
      .select("rest_id, category_id, item_payload, cuisine_tag, mood_tag")
      .in("rest_id", restIds)
      .eq("is_deleted", false);

    if (cuisine_tag) itemQuery = itemQuery.eq("cuisine_tag", cuisine_tag);
    if (mood_tag) itemQuery = itemQuery.eq("mood_tag", mood_tag);

    const { data: itemRows, error: itemsError } = await itemQuery;
    if (itemsError) throw itemsError;

    if (!itemRows || itemRows.length === 0) {
      return res.success({ data: { result: [], count: 0, page: Number(page), per_page: Number(per_page) } });
    }

    // 3. Pull dishes (with recipeIngredients) to cross-reference by name.
    //    dishes.name is matched against menu_items.item_payload.itemname
    //    (case-insensitive, trimmed) per the confirmed linking rule.
    //    Non-fatal: if this table/column is misconfigured or empty, we still
    //    want to return menu results — just without ingredient-based
    //    allergy filtering for that request (keyword matching alone won't
    //    run either, since there's no recipeIngredients to check).
    let dishByName = new Map();
    try {
      const { data: dishes, error: dishesError } = await supabase
        .from("dishes")
        .select("name, recipeIngredients");
      if (dishesError) throw dishesError;
      dishByName = new Map(
        (dishes || []).map((d) => [String(d.name || "").trim().toLowerCase(), d]),
      );
    } catch (dishesErr) {
      console.error("[QuizResults] dishes table fetch failed — continuing without ingredient-based allergy filtering:", dishesErr.message);
    }

    // 4. Filter items by allergy safety (keyword-first, AI-fallback for
    //    unrecognized ingredient names only). Wrapped per-item so one
    //    malformed row (missing item_payload, bad dishes data, etc.) can't
    //    take down the whole request — it's skipped and logged instead.
    const safeItems = [];
    for (const row of itemRows) {
      try {
        // Outlets with menu never synced can have null/incomplete
        // item_payload rows — skip those defensively rather than crashing.
        if (!row.item_payload || !row.item_payload.itemname) {
          continue;
        }

        const itemName = String(row.item_payload.itemname).trim().toLowerCase();
        const dish = dishByName.get(itemName);
        const recipeIngredients = Array.isArray(dish?.recipeIngredients) ? dish.recipeIngredients : [];

        const safe = await isDishSafeForAllergies(recipeIngredients, activeAllergies);
        if (!safe) continue;

        const outlet = outletByRestId.get(row.rest_id);
        safeItems.push({
          ...row.item_payload,
          cuisine_tag: row.cuisine_tag,
          mood_tag: row.mood_tag,
          outlet_id: outlet?.id,
          petpooja_outlet_id: row.rest_id,
          resturent_id: outlet?.resturent_id,
          outlet_name: outlet?.name,
          brand_name: outlet?.brand_name,
          outlet_city: outlet?.city,
          outlet_address: outlet?.address,
        });
      } catch (itemErr) {
        console.error(
          "[QuizResults] Skipping item due to error:",
          row?.item_payload?.itemname || "(unknown item)",
          "rest_id:", row?.rest_id,
          itemErr.message,
        );
        continue;
      }
    }

    // 5. Paginate (5 at a time, "Show 5 more" pattern)
    const pageNum = Math.max(1, Number(page) || 1);
    const perPageNum = Math.max(1, Number(per_page) || 5);
    const from = (pageNum - 1) * perPageNum;
    const to = from + perPageNum;

    const paginated = safeItems.slice(from, to);

    return res.success({
      data: {
        result: paginated,
        count: safeItems.length,
        page: pageNum,
        per_page: perPageNum,
        has_more: to < safeItems.length,
      },
    });
  } catch (err) {
    console.error("fetchQuizResults error:", err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};