const supabase = require("../../config/db");

// ==========================
// ✅ ADD DISCOUNT
// ==========================
const addDiscount = async (req, res) => {
  try {
    const { discount_code, discount_percentage } = req.body;

    if (!discount_code || discount_percentage === undefined) {
      return res.error({
        message: "discount_code and discount_percentage are required",
        status: 400
      });
    }

    if (
      typeof discount_percentage !== "number" ||
      discount_percentage < 0 ||
      discount_percentage > 100
    ) {
      return res.error({
        message: "discount_percentage must be a number between 0 and 100",
        status: 400
      });
    }

    const { data, error: dbError } = await supabase
      .from("discount")
      .insert({
        discount_code: discount_code.trim().toUpperCase(),
        discount_percentage
      })
      .select()
      .single();

    if (dbError) {
      console.log(dbError);
      if (dbError.code === "23505") {
        return res.error({ message: "Discount code already exists", status: 409 });
      }
      return res.error({ message: "Error occurred while adding discount", status: 500 });
    }

    return res.success({ data, message: "Discount added successfully" });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// ✅ EDIT DISCOUNT
// ==========================
const editDiscount = async (req, res) => {
  try {
    const uuid = req.params.uuid;

    if (!uuid) {
      return res.error({ message: "Discount ID is required", status: 400 });
    }

    const allowedFields = ["discount_code", "discount_percentage", "is_active"];
    const updatePayload = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updatePayload[field] = req.body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.error({ message: "No valid fields provided to update", status: 400 });
    }

    if (
      updatePayload.discount_percentage !== undefined &&
      (typeof updatePayload.discount_percentage !== "number" ||
        updatePayload.discount_percentage < 0 ||
        updatePayload.discount_percentage > 100)
    ) {
      return res.error({
        message: "discount_percentage must be a number between 0 and 100",
        status: 400
      });
    }

    if (updatePayload.discount_code) {
      updatePayload.discount_code = updatePayload.discount_code.trim().toUpperCase();
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data, error: dbError } = await supabase
      .from("discount")
      .update(updatePayload)
      .eq("id", uuid)
      .select()
      .single();

    if (dbError) {
      console.log(dbError);
      if (dbError.code === "23505") {
        return res.error({ message: "Discount code already exists", status: 409 });
      }
      return res.error({ message: "Update failed", status: 400 });
    }

    return res.success({ data, message: "Discount updated successfully" });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// ✅ GET ALL DISCOUNTS
// ==========================
const getAllDiscounts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error: dbError, count } = await supabase
      .from("discount")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (dbError) {
      console.log(dbError);
      return res.error({ message: "Error occurred during fetching the data", status: 500 });
    }

    return res.success({ data: { result: data, count } });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// ✅ APPLY DISCOUNT
// No user checks — anyone can use any number of times
// Only checks: code exists + is_active
// Returns 404 "not available" for deleted or missing codes
// ==========================
const applyDiscount = async (req, res) => {
  try {
    const { discount_code } = req.body;

    if (!discount_code) {
      return res.error({ message: "discount_code is required", status: 400 });
    }

    const { data, error: dbError } = await supabase
      .from("discount")
      .select("id, discount_code, discount_percentage, is_active")
      .eq("discount_code", discount_code.trim().toUpperCase())
      .maybeSingle();

    // Deleted or never existed
    if (dbError || !data) {
      return res.error({ message: "This coupon is not available anymore", status: 404 });
    }

    // Exists but deactivated by admin
    if (!data.is_active) {
      return res.error({ message: "This coupon is not available anymore", status: 410 });
    }

    return res.success({
      data: {
        id: data.id,
        discount_code: data.discount_code,
        discount_percentage: data.discount_percentage
      },
      message: "Discount code is valid"
    });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// ✅ CLAIM DISCOUNT
// No per-user check — just logs the usage
// Still validates code exists + is_active at claim time
// ==========================
const claimDiscount = async (req, res) => {
  try {
    const { discount_code, user_id } = req.body;

    if (!discount_code) {
      return res.error({ message: "discount_code is required", status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("discount")
      .select("id, discount_code, discount_percentage, is_active")
      .eq("discount_code", discount_code.trim().toUpperCase())
      .maybeSingle();

    // Deleted between apply and claim
    if (fetchError || !existing) {
      return res.error({ message: "This coupon is not available anymore", status: 404 });
    }

    // Deactivated between apply and claim
    if (!existing.is_active) {
      return res.error({ message: "This coupon is not available anymore", status: 410 });
    }

    // Log usage (non-blocking insert — never fails the order)
    supabase
      .from("discount_usage_logs")
      .insert({
        discount_id:   existing.id,
        discount_code: existing.discount_code,
        user_id:       user_id || null,
        used_at:       new Date().toISOString()
      })
      .then(({ error }) => {
        if (error) console.error("discount_usage_logs insert error:", error);
      });

    return res.success({
      data: { discount_code: existing.discount_code },
      message: "Discount applied successfully"
    });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ==========================
// ✅ DELETE DISCOUNT
// ==========================
const deleteDiscount = async (req, res) => {
  try {
    const uuid = req.params.uuid;

    if (!uuid) {
      return res.error({ message: "Discount ID is required", status: 400 });
    }

    const { error: dbError } = await supabase
      .from("discount")
      .delete()
      .eq("id", uuid);

    if (dbError) {
      console.log(dbError);
      return res.error({ message: "Delete failed", status: 500 });
    }

    return res.success({ message: "Discount deleted successfully" });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

module.exports = {
  addDiscount,
  editDiscount,
  getAllDiscounts,
  applyDiscount,
  claimDiscount,
  deleteDiscount
};