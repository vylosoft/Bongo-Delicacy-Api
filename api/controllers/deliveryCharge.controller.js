const supabase = require("../../config/db");

// ==========================
// GET ALL DELIVERY CHARGES
// ==========================
const getAll = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const {
      data,
      error,
      count
    } = await supabase
      .from("delivery_charges")
      .select("*", { count: "exact" })
      .order("from_km", { ascending: true })
      .range(from, to);

    if (error) {
      console.log(error);

      return res.error({
        message: "Error fetching delivery charges",
        status: 500
      });
    }

    return res.success({
      data: {
        result: data,
        count
      }
    });

  } catch (err) {
    console.log(err);

    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};


// ==========================
// GET SINGLE
// ==========================
const getDetails = async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error } = await supabase
      .from("delivery_charges")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return res.error({
        message: "Delivery charge not found",
        status: 404
      });
    }

    return res.success({
      data
    });

  } catch (err) {
    console.log(err);

    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};


// ==========================
// ADD
// ==========================
const addDeliveryCharge = async (req, res) => {
  try {
    const payload = {
      from_km: req.body.from_km,
      to_km: req.body.to_km,
      charge: req.body.charge,
      is_active: req.body.is_active ?? true
    };

    // prevent overlapping slabs
    const { data: existing } = await supabase
      .from("delivery_charges")
      .select("*")
      .lte("from_km", payload.to_km)
      .gte("to_km", payload.from_km);

    if (existing?.length) {
      return res.error({
        message:
          "Distance range overlaps existing slab",
        status: 400
      });
    }

    const { data, error } = await supabase
      .from("delivery_charges")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.log(error);

      return res.error({
        message: "Failed to add delivery charge",
        status: 400
      });
    }

    return res.success({
      data,
      message:
        "Delivery charge added successfully"
    });

  } catch (err) {
    console.log(err);

    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};


// ==========================
// UPDATE
// ==========================
const update = async (req, res) => {
  try {
    const id = req.params.id;

    const payload = {
      ...req.body
    };

    // exclude current row while checking overlap
    const { data: existing } = await supabase
      .from("delivery_charges")
      .select("*")
      .neq("id", id)
      .lte("from_km", payload.to_km)
      .gte("to_km", payload.from_km);

    if (existing?.length) {
      return res.error({
        message:
          "Distance range overlaps existing slab",
        status: 400
      });
    }

    const { data, error } = await supabase
      .from("delivery_charges")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.log(error);

      return res.error({
        message: "Update failed",
        status: 400
      });
    }

    return res.success({
      data,
      message:
        "Delivery charge updated successfully"
    });

  } catch (err) {
    console.log(err);

    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};


// ==========================
// DELETE
// ==========================
const remove = async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await supabase
      .from("delivery_charges")
      .delete()
      .eq("id", id);

    if (error) {
      console.log(error);

      return res.error({
        message: "Delete failed",
        status: 400
      });
    }

    return res.success({
      message:
        "Delivery charge deleted successfully"
    });

  } catch (err) {
    console.log(err);

    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

module.exports = {
  getAll,
  getDetails,
  addDeliveryCharge,
  update,
  remove
};