const Joi = require('joi');
const { fetchMenuCatagoryByResturentSchema, fetchMenuByCatagorySchema ,fetchAdminMenuWithCategorySchema } = require('../validations/menu.validation');
const { petpujaService } = require('../../utils/petpujaService');

exports.fetchMenuCatagoryByResturent = async (req, res) => {
    try {
        const reqBody = {
            ...req.query
        }
        const validateSchema = fetchMenuCatagoryByResturentSchema(reqBody);
        if (validateSchema.error) {
            return res.error({ message: validateSchema.error.details.map(e => e.message).join(', '), status: 400 });
        }
        const reqData = validateSchema.value;
        const { resturent_identifier } = reqData;
        try {
            const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
            const requestBody = {
                restID: resturent_identifier
            }
            const responseData = await petpujaService(URI, requestBody);
            console.log(responseData);
            const catagories = responseData.categories.map(i => {
                return {
                    id: i.categoryid,
                    name: i.categoryname,
                    active: i.active,
                }
            });
            return res.success({ data: catagories });
        } catch (error) {
            console.log(error);
            return res.error({ message: 'Something went wrong' });
        }
    } catch (err) {
        return res.error({ message: 'Internal server error' });
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
    const responseData = await petpujaService(URI, {
      restID: resturent_identifier,
    });

    // Build tax lookup: taxid -> tax object
    const taxMap = new Map(
      (responseData.taxes || []).map((t) => [String(t.taxid), t])
    );

    const itemsByCategory = (responseData.items || []).filter(
      (item) => String(item.item_categoryid) === String(category_id)
    );

    const result = itemsByCategory.map((item) => {
      const basePrice = Number(item.price || 0);

      // item_tax can be "3174,3175" or empty
      const taxIds = String(item.item_tax || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      // Build per-item tax breakup
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

      const taxInclusive = item.tax_inclusive === true;

      const price_with_gst = taxInclusive
        ? +basePrice.toFixed(2)
        : +(basePrice + gst_total_amount).toFixed(2);

      return {
        ...item,
        base_price: +basePrice.toFixed(2),
        tax_breakup,
        gst_total_percentage: +gst_total_percentage.toFixed(2),
        gst_total_amount,
        price_with_gst,
      };
    });

    return res.success({ data: result });
  } catch (err) {
    return res.error({ message: "Internal server error" });
  }
};

exports.fetchAdminMenuWithCategory = async (req, res) => {
  try {
    const validateSchema = fetchAdminMenuWithCategorySchema(req.body);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map(e => e.message).join(', '),
        status: 400
      });
    }

    const { resturent_identifier } = validateSchema.value;

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    console.log("BASE URL:", process.env.PETPUJA_BASE_URL);

    const requestBody = { restID: resturent_identifier };
    const responseData = await petpujaService(URI, requestBody);

    console.log("PP RESPONSE:", responseData);

    const categories = responseData?.categories || [];
    const items = responseData?.items || [];

    const data = categories.map(cat => ({
      id: cat.categoryid,
      name: cat.categoryname,
      active: cat.active,
      menus: items.filter(menu => menu.item_categoryid == cat.categoryid)
    }));

    return res.success({ data });

  } catch (error) {
    console.log("ADMIN MENU ERROR:", error);
    return res.error({ message: 'Internal server error' });
  }
};

