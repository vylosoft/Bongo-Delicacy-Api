const Joi = require("joi");
const {
  fetchMenuCatagoryByResturentSchema,
  fetchMenuByCatagorySchema,
  fetchAdminMenuWithCategorySchema,
} = require("../validations/menu.validation");

const supabase = require("../../config/db");
const crypto = require("crypto");

/* -------------------- QUIZ TAG CONSTANTS -------------------- */

const CUISINE_TAGS = ["pure_veg", "authentic_bengali", "indo_chinese", "biryani"];
const MOOD_TAGS    = ["light", "spicy", "comfort", "special"];

/**
 * Build a map: addon_group_id -> full addon group details
 */
const buildAddonGroupMap = (addonGroups) => {
  if (!Array.isArray(addonGroups)) return new Map();

  return new Map(
    addonGroups.map((group) => [
      String(group.addongroupid),
      {
        addon_group_id: String(group.addongroupid),
        addon_group_name: String(group.addongroup_name || ""),
        addon_group_rank: String(group.addongroup_rank || "0"),
        active: String(group.active || "1"),
        items: (group.addongroupitems || []).map((addonItem) => ({
          id: String(addonItem.addonitemid),
          name: String(addonItem.addonitem_name || ""),
          price: Number(addonItem.addonitem_price || 0),
          rank: String(addonItem.addonitem_rank || "0"),
          active: String(addonItem.active || "1"),
          attributes: addonItem.attributes || "",
        })),
      },
    ]),
  );
};

/**
 * Expand item.addon references into full addon group details
 * @param {Object} item - Menu item with addon references
 * @param {Map} addonGroupMap - Map of addon_group_id -> addon group details
 * @returns {Array} - Expanded addon groups with items
 */
const expandItemAddons = (item, addonGroupMap) => {
  if (!Array.isArray(item.addon) || item.addon.length === 0) {
    return [];
  }

  const expanded = [];

  for (const addonRef of item.addon) {
    const groupId = String(addonRef.addon_group_id || "");
    const fullGroup = addonGroupMap.get(groupId);

    if (!fullGroup) continue;

    const activeItems = fullGroup.items.filter((i) => String(i.active) === "1");

    expanded.push({
      addon_group_id: fullGroup.addon_group_id,
      addon_group_name: fullGroup.addon_group_name,
      addon_group_rank: fullGroup.addon_group_rank,
      selection_min: Number(
        addonRef.addon_item_selection_min ?? addonRef.min_qty ?? 0,
      ),
      selection_max: Number(
        addonRef.addon_item_selection_max ?? addonRef.max_qty ?? 1,
      ),
      active: fullGroup.active,
      items: activeItems,
    });
  }

  return expanded;
};

const getStockMap = async (rest_id) => {
  try {
    const { data, error } = await supabase
      .from("menu_item_stock")
      .select("item_id,in_stock,turn_on_time")
      .eq("rest_id", String(rest_id));

    if (error) {
      console.error("Supabase stock fetch error:", error);
      return new Map();
    }

    return new Map(
      (data || []).map((r) => [
        String(r.item_id),
        {
          in_stock: String(r.in_stock),
          turn_on_time: r.turn_on_time || null,
        },
      ]),
    );
  } catch (e) {
    console.error("getStockMap error:", e);
    return new Map();
  }
};

// attach availability to item, without removing it
const applyAvailability = (item, stockMap) => {
  const ppItemId = String(item.itemid);

  const stockData = stockMap.get(ppItemId);

  const override = stockData?.in_stock;

  const turn_on_time = stockData?.turn_on_time || null;

  // default = available
  const isAvailable = override ? override !== "0" : true;

  return {
    ...item,

    available: isAvailable,

    in_stock: override || "1",

    turn_on_time,

    active: isAvailable ? item.active : "0",
  };
};

/* -------------------- CATEGORY LIST -------------------- */

exports.fetchMenuCatagoryByResturent = async (req, res) => {
  try {
    const reqBody = { ...req.query };

    const validateSchema = fetchMenuCatagoryByResturentSchema(reqBody);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map((e) => e.message).join(", "),
        status: 400,
      });
    }

    const rest_id = String(validateSchema.value.resturent_identifier).trim();

    const { data: categories, error } = await supabase
      .from("menu_categories")
      .select("category_id, category_name, active")
      .eq("rest_id", rest_id);

    if (error) throw error;

    if (!categories || categories.length === 0) {
      return res.error({
        message: "Menu not cached yet",
        status: 404,
      });
    }

    const catagories = categories.map((i) => ({
      id: i.category_id,
      name: i.category_name,
      active: i.active,
    }));

    return res.success({ data: catagories });
  } catch (err) {
    console.error(err);
    return res.error({ message: "Internal server error" });
  }
};

/* -------------------- MENU BY CATEGORY -------------------- */

exports.fetchMenuByCatagory = async (req, res) => {
  try {
    const reqBody = { ...req.body };

    const validateSchema = fetchMenuByCatagorySchema(reqBody);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map((e) => e.message).join(", "),
        status: 400,
      });
    }

    const { resturent_identifier, category_id } = validateSchema.value;
    const rest_id = String(resturent_identifier).trim();

    // taxes + addon groups
    const { data: metaRow, error: metaError } = await supabase
      .from("menu_metadata")
      .select("taxes, addongroups")
      .eq("rest_id", rest_id)
      .maybeSingle();

    if (metaError) throw metaError;

    if (!metaRow) {
      return res.error({
        message: "Menu not cached yet",
        status: 404,
      });
    }

    const taxMap = new Map(
      (metaRow.taxes || []).map((t) => [String(t.taxid), t]),
    );

    const addonGroupMap = buildAddonGroupMap(metaRow.addongroups || []);

    // items for this category
    const { data: itemRows, error: itemsError } = await supabase
      .from("menu_items")
      .select("item_payload")
      .eq("rest_id", rest_id)
      .eq("category_id", String(category_id))
      .eq("is_deleted", false);

    if (itemsError) throw itemsError;

    // stock overrides
    const stockMap = await getStockMap(rest_id);

    const result = (itemRows || []).map((row) => {
      const itemWithAvailability = applyAvailability(row.item_payload, stockMap);

      const basePrice = Number(itemWithAvailability.price || 0);

      const taxIds = String(itemWithAvailability.item_tax || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      const tax_breakup = taxIds
        .map((taxid) => {
          const t = taxMap.get(String(taxid));
          if (!t) return null;

          const tax_percentage = Number(t.tax || 0);
          const amount = +((basePrice * tax_percentage) / 100).toFixed(2);

          return {
            id: String(t.taxid),
            name: t.taxname,
            tax_percentage: String(t.tax),
            amount: String(amount),
          };
        })
        .filter(Boolean);

      const gst_total_percentage = tax_breakup.reduce(
        (sum, t) => sum + Number(t.tax_percentage || 0),
        0,
      );

      const gst_total_amount = +tax_breakup
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)
        .toFixed(2);

      const taxInclusive = itemWithAvailability.tax_inclusive === true;

      const price_with_gst = taxInclusive
        ? +basePrice.toFixed(2)
        : +(basePrice + gst_total_amount).toFixed(2);

      // Expand addon references
      const expandedAddons = expandItemAddons(itemWithAvailability, addonGroupMap);

      const variationsWithAddons = (itemWithAvailability.variation || []).map(
        (variation) => ({
          ...variation,
          addons: expandItemAddons(variation, addonGroupMap),
        }),
      );

      return {
        ...itemWithAvailability,

        variation: variationsWithAddons,

        base_price: +basePrice.toFixed(2),
        tax_breakup,
        gst_total_percentage: +gst_total_percentage.toFixed(2),
        gst_total_amount,
        price_with_gst,
        addons: expandedAddons,
      };
    });

    return res.success({ data: result });
  } catch (err) {
    console.error(err);
    return res.error({ message: "Internal server error" });
  }
};

/* -------------------- ADMIN: ALL CATEGORIES + MENUS -------------------- */

exports.fetchAdminMenuWithCategory = async (req, res) => {
  try {
    const validateSchema = fetchAdminMenuWithCategorySchema(req.body);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map((e) => e.message).join(", "),
        status: 400,
      });
    }

    const rest_id = String(validateSchema.value.resturent_identifier).trim();

    const { data: categories, error: catError } = await supabase
      .from("menu_categories")
      .select("category_id, category_name, active")
      .eq("rest_id", rest_id);

    if (catError) throw catError;

    if (!categories || categories.length === 0) {
      return res.error({
        message: "Menu not cached yet",
        status: 404,
      });
    }

    const { data: itemRows, error: itemsError } = await supabase
      .from("menu_items")
      .select("category_id, item_payload, cuisine_tag, mood_tag")
      .eq("rest_id", rest_id)
      .eq("is_deleted", false);

    if (itemsError) throw itemsError;

    const { data: metaRow, error: metaError } = await supabase
      .from("menu_metadata")
      .select("addongroups")
      .eq("rest_id", rest_id)
      .maybeSingle();

    if (metaError) throw metaError;

    const addonGroupMap = buildAddonGroupMap(metaRow?.addongroups || []);

    // stock overrides
    const stockMap = await getStockMap(rest_id);

    // attach availability for all items AND expand addons
    const itemsWithAvailability = (itemRows || []).map((row) => {
      const itemWithAvail = applyAvailability(row.item_payload, stockMap);

      const expandedAddons = expandItemAddons(itemWithAvail, addonGroupMap);

      return {
        ...itemWithAvail,
        addons: expandedAddons,
        cuisine_tag: row.cuisine_tag,
        mood_tag: row.mood_tag,
      };
    });

    const data = categories.map((cat) => ({
      id: cat.category_id,
      name: cat.category_name,
      active: cat.active,
      menus: itemsWithAvailability.filter(
        (menu) => String(menu.item_categoryid) === String(cat.category_id),
      ),
    }));

    return res.success({ data });
  } catch (error) {
    console.error("ADMIN MENU ERROR:", error);
    return res.error({ message: "Internal server error" });
  }
};

/* -------------------- ADMIN: SET CUISINE / MOOD TAG ON AN ITEM -------------------- */

exports.updateMenuItemTags = async (req, res) => {
  try {
    const { resturent_identifier, item_id, cuisine_tag, mood_tag } = req.body;

    const rest_id = String(resturent_identifier || "").trim();
    const itemId  = String(item_id || "").trim();

    if (!rest_id || !itemId) {
      return res.error({
        message: "resturent_identifier and item_id are required",
        status: 400,
      });
    }

    if (cuisine_tag && !CUISINE_TAGS.includes(cuisine_tag)) {
      return res.error({
        message: `cuisine_tag must be one of: ${CUISINE_TAGS.join(", ")}`,
        status: 400,
      });
    }

    if (mood_tag && !MOOD_TAGS.includes(mood_tag)) {
      return res.error({
        message: `mood_tag must be one of: ${MOOD_TAGS.join(", ")}`,
        status: 400,
      });
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    if (cuisine_tag !== undefined) updatePayload.cuisine_tag = cuisine_tag || null;
    if (mood_tag !== undefined) updatePayload.mood_tag = mood_tag || null;

    const { data, error } = await supabase
      .from("menu_items")
      .update(updatePayload)
      .eq("rest_id", rest_id)
      .eq("item_id", itemId)
      .select("item_id, cuisine_tag, mood_tag")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.error({ message: "Item not found", status: 404 });
    }

    return res.success({ data });
  } catch (err) {
    console.error("updateMenuItemTags error:", err);
    return res.error({ message: "Internal server error" });
  }
};

/* -------------------- FOOD FINDER QUIZ: FILTER BY CUISINE / MOOD -------------------- */

exports.fetchMenuByQuizTags = async (req, res) => {
  try {
    const { resturent_identifier, cuisine_tag, mood_tag } = req.body;

    const rest_id = String(resturent_identifier || "").trim();
    if (!rest_id) {
      return res.error({ message: "resturent_identifier required", status: 400 });
    }

    if (cuisine_tag && !CUISINE_TAGS.includes(cuisine_tag)) {
      return res.error({
        message: `cuisine_tag must be one of: ${CUISINE_TAGS.join(", ")}`,
        status: 400,
      });
    }

    if (mood_tag && !MOOD_TAGS.includes(mood_tag)) {
      return res.error({
        message: `mood_tag must be one of: ${MOOD_TAGS.join(", ")}`,
        status: 400,
      });
    }

    let query = supabase
      .from("menu_items")
      .select("category_id, item_payload, cuisine_tag, mood_tag")
      .eq("rest_id", rest_id)
      .eq("is_deleted", false);

    if (cuisine_tag) query = query.eq("cuisine_tag", cuisine_tag);
    if (mood_tag) query = query.eq("mood_tag", mood_tag);

    const { data: itemRows, error } = await query;
    if (error) throw error;

    const stockMap = await getStockMap(rest_id);

    const result = (itemRows || []).map((row) => ({
      ...applyAvailability(row.item_payload, stockMap),
      cuisine_tag: row.cuisine_tag,
      mood_tag: row.mood_tag,
    }));

    return res.success({ data: result });
  } catch (err) {
    console.error("fetchMenuByQuizTags error:", err);
    return res.error({ message: "Internal server error" });
  }
};