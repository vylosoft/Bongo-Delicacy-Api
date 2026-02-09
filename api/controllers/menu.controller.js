const Joi = require("joi");
const {
  fetchMenuCatagoryByResturentSchema,
  fetchMenuByCatagorySchema,
  fetchAdminMenuWithCategorySchema,
} = require("../validations/menu.validation");

const { supabase } = require("../../utils/supabaseClient");
const crypto = require("crypto");

/**
 * Hash payload (used if we do fallback-to-live and want to cache it)
 */
/**
 * Build a map: addon_group_id -> full addon group details
 */
const buildAddonGroupMap = (addonGroups) => {
  if (!Array.isArray(addonGroups)) return new Map();

  return new Map(
    addonGroups.map((group) => [
      String(group.addongroupid), // ✅ FIXED
      {
        addon_group_id: String(group.addongroupid),
        addon_group_name: String(group.addongroup_name || ""),
        addon_group_rank: String(group.addongroup_rank || "0"),
        active: String(group.active || "1"),
        items: (group.addongroupitems || []).map((addonItem) => ({
          id: String(addonItem.addonitemid), // ✅ FIXED
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

const hashPayload = (payload) => {
  const raw = JSON.stringify(payload);
  return crypto.createHash("sha256").update(raw).digest("hex");
};

/**
 * Your webhook payload might be:
 * 1) already flat: { categories, items, taxes, ... }
 * 2) nested: { success, restaurants: [ { categories, items, taxes, ... } ] }
 *
 * This ensures the controller always gets the same structure it expects.
 */
const normalizePetpoojaPayload = (payload) => {
  if (!payload) return payload;

  // already flat response shape
  if (payload.categories || payload.items || payload.taxes) return payload;

  // nested under restaurants[0]
  const r0 = payload?.restaurants?.[0];
  if (r0 && (r0.categories || r0.items || r0.taxes)) return r0;

  return payload;
};

/**
 * DB-first menu source:
 * - Uses cached webhook payload from petpooja_menu_cache
 * - If not found, (optional) falls back to PetPooja and caches it
 *
 * If you want STRICT DB-only: set ALLOW_FALLBACK_TO_LIVE=false
 */
const ALLOW_FALLBACK_TO_LIVE = true;

const getMenuSource = async (resturent_identifier) => {
  const rest_id = String(resturent_identifier || "").trim();
  if (!rest_id) return null;

  // 1) Try DB cache first
  const { data: cacheRow, error: cacheErr } = await supabase
    .from("petpooja_menu_cache")
    .select("payload,version_hash,last_pushed_at")
    .eq("rest_id", rest_id)
    .maybeSingle();

  if (!cacheErr && cacheRow?.payload) {
    return normalizePetpoojaPayload(cacheRow.payload);
  }

  if (!ALLOW_FALLBACK_TO_LIVE) return null;

  // 2) Fallback to live PetPooja (optional)
  // const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
  // const live = await petpujaService(URI, { restID: rest_id });

  // cache it for next time
  const payloadToStore = live;
  const version_hash = hashPayload(payloadToStore);
  const now = new Date().toISOString();

  await supabase.from("petpooja_menu_cache").upsert(
    {
      rest_id,
      payload: payloadToStore,
      version_hash,
      last_pushed_at: now,
      updated_at: now,
    },
    { onConflict: "rest_id" }
  );

  return normalizePetpoojaPayload(live);
};

const getStockMap = async (rest_id) => {
  try {
    const { data, error } = await supabase
      .from("menu_item_stock")
      .select("item_id,in_stock")
      .eq("rest_id", String(rest_id));

    if (error) {
      console.error("Supabase stock fetch error:", error);
      return new Map();
    }

    return new Map((data || []).map((r) => [String(r.item_id), String(r.in_stock)]));
  } catch (e) {
    console.error("getStockMap error:", e);
    return new Map();
  }
};

// attach availability to item, without removing it
const applyAvailability = (item, stockMap) => {
  const ppItemId = String(item.itemid);
  const override = stockMap.get(ppItemId); // "0" or "1" or undefined

  // default = available
  const isAvailable = override ? override !== "0" : true;

  return {
    ...item,
    available: isAvailable,
    active: isAvailable ? item.active : "0",
  };
};

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

    const { resturent_identifier } = validateSchema.value;

    try {
      const responseData = await getMenuSource(resturent_identifier);

      if (!responseData) {
        return res.error({
          message: "Menu not cached yet",
          status: 404,
        });
      }

      const catagories = (responseData.categories || []).map((i) => ({
        id: i.categoryid,
        name: i.categoryname,
        active: i.active,
      }));

      return res.success({ data: catagories });
    } catch (error) {
      console.log(error);
      return res.error({ message: "Something went wrong" });
    }
  } catch (err) {
    return res.error({ message: "Internal server error" });
  }
};

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

    const responseData = await getMenuSource(resturent_identifier);
    if (!responseData) {
      return res.error({
        message: "Menu not cached yet",
        status: 404,
      });
    }

    // Build tax lookup: taxid -> tax object
    const taxMap = new Map(
      (responseData.taxes || []).map((t) => [String(t.taxid), t]),
    );

    // ✅ Build addon group lookup
    const addonGroupMap = buildAddonGroupMap(responseData.addongroups || []);

    // Filter items by category (but do NOT remove out-of-stock items)
    const itemsByCategory = (responseData.items || []).filter(
      (item) => String(item.item_categoryid) === String(category_id),
    );

    // stock overrides
    const stockMap = await getStockMap(resturent_identifier);

    const result = itemsByCategory.map((item) => {
      // apply availability flag + active override
      const itemWithAvailability = applyAvailability(item, stockMap);

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

      // ✅ Expand addon references
      const expandedAddons = expandItemAddons(
        itemWithAvailability,
        addonGroupMap,
      );

      return {
        ...itemWithAvailability,
        base_price: +basePrice.toFixed(2),
        tax_breakup,
        gst_total_percentage: +gst_total_percentage.toFixed(2),
        gst_total_amount,
        price_with_gst,
        addons: expandedAddons, // ✅ NEW: Full addon details
      };
    });

    return res.success({ data: result });
  } catch (err) {
    console.error(err);
    return res.error({ message: "Internal server error" });
  }
};

exports.fetchAdminMenuWithCategory = async (req, res) => {
  try {
    const validateSchema = fetchAdminMenuWithCategorySchema(req.body);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map((e) => e.message).join(", "),
        status: 400,
      });
    }

    const { resturent_identifier } = validateSchema.value;

    const responseData = await getMenuSource(resturent_identifier);
    if (!responseData) {
      return res.error({
        message: "Menu not cached yet",
        status: 404,
      });
    }

    const categories = responseData?.categories || [];
    const items = responseData?.items || [];

    // ✅ Build addon group lookup
    const addonGroupMap = buildAddonGroupMap(responseData.addongroups || []);

    // stock overrides
    const stockMap = await getStockMap(resturent_identifier);

    // attach availability for all items AND expand addons
    const itemsWithAvailability = items.map((item) => {
      const itemWithAvail = applyAvailability(item, stockMap);

      // ✅ Expand addon references
      const expandedAddons = expandItemAddons(itemWithAvail, addonGroupMap);

      return {
        ...itemWithAvail,
        addons: expandedAddons, // ✅ NEW: Full addon details
      };
    });

    const data = categories.map((cat) => ({
      id: cat.categoryid,
      name: cat.categoryname,
      active: cat.active,
      menus: itemsWithAvailability.filter(
        (menu) => menu.item_categoryid == cat.categoryid,
      ),
    }));

    return res.success({ data });
  } catch (error) {
    console.log("ADMIN MENU ERROR:", error);
    return res.error({ message: "Internal server error" });
  }
};