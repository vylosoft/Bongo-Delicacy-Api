const Joi = require('joi');
const { fetchMenuCatagoryByResturentSchema, fetchMenuByCatagorySchema ,fetchAdminMenuWithCategorySchema } = require('../validations/menu.validation');
const { petpujaService } = require('../../utils/petpujaService');
const { supabase } = require("../../utils/supabaseClient");


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
    available: isAvailable,              // ✅ your new field
    active: isAvailable ? item.active : "0", // ✅ force inactive when OFF
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
      const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
      const requestBody = { restID: resturent_identifier };

      const responseData = await petpujaService(URI, requestBody);

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

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const responseData = await petpujaService(URI, { restID: resturent_identifier });

    // Build tax lookup: taxid -> tax object
    const taxMap = new Map((responseData.taxes || []).map((t) => [String(t.taxid), t]));

    // Filter items by category (but do NOT remove out-of-stock items)
    const itemsByCategory = (responseData.items || []).filter(
      (item) => String(item.item_categoryid) === String(category_id)
    );

    // ✅ stock overrides
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
        0
      );

      const gst_total_amount = +tax_breakup
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)
        .toFixed(2);

      const taxInclusive = itemWithAvailability.tax_inclusive === true;

      const price_with_gst = taxInclusive
        ? +basePrice.toFixed(2)
        : +(basePrice + gst_total_amount).toFixed(2);

      return {
        ...itemWithAvailability,
        base_price: +basePrice.toFixed(2),
        tax_breakup,
        gst_total_percentage: +gst_total_percentage.toFixed(2),
        gst_total_amount,
        price_with_gst,
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

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const requestBody = { restID: resturent_identifier };

    const responseData = await petpujaService(URI, requestBody);

    const categories = responseData?.categories || [];
    const items = responseData?.items || [];

    // ✅ stock overrides
    const stockMap = await getStockMap(resturent_identifier);

    // attach availability for all items
    const itemsWithAvailability = items.map((item) => applyAvailability(item, stockMap));

    const data = categories.map((cat) => ({
      id: cat.categoryid,
      name: cat.categoryname,
      active: cat.active,
      menus: itemsWithAvailability.filter((menu) => menu.item_categoryid == cat.categoryid),
    }));

    return res.success({ data });
  } catch (error) {
    console.log("ADMIN MENU ERROR:", error);
    return res.error({ message: "Internal server error" });
  }
};
