
const supabase = require("../../config/db");
const { getAllSchema, updateOutletTableSchema, addResturentTableSchema } = require("../validations/outletTable.validation.js");


const getAll = async (req, res) => {
  try {
    const payload = {
      ...req.query
    };
    const { value, error } = getAllSchema(payload);
    if (error) {
      return res.error({
        message: error.details.map((e) => e.message).join(", "),
        status: 400
      });
    }

    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const {
      data,
      error: dbError,
      count
    } = await supabase
      .from("outlet_tables")
      .select("id, table_number, capacity, is_booked, outlet_id, is_active", { count: "exact" })
      .range(from, to);
    if (dbError) {
      console.log(dbError);
      return res.error({
        message: "Error occured during fetching the data",
        status: 500
      });
    }
    return res.success({ data: { result: data, count } });
  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

const getDetails = async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error: dbError } = await supabase
      .from("outlet_tables")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return res.error({ message: "No data found.", status: 404 });
    if (dbError) {
      return res.error({
        message: "Error occured during fetching the data",
        status: 500
      });
    }

    return res.success({ data: data });
  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

const update = async (req, res) => {
  try {
    const requestPayload = {
      ...req.body,
      ...req.params
    }
    // validation rules
    const { value, error: validationError } = updateOutletTableSchema(requestPayload);
    // Return validation error.
    if (validationError) {
      return res.error({
        message: validationError.details.map((e) => e.message).join(", "),
        status: 400
      });
    }
    const payload = value;
    // update the data
    const { data, error: dbError } = await supabase
      .from("outlet_tables")
      .update(payload)
      .eq("id", value.id)
      .select()
      .single();

    if (dbError) {
      console.log("err", dbError)
      return res.error({
        message: "Update failed.",
        status: 400
      });
    }

    return res.success({ data: data });

  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

const addOutletTable = async (req, res) => {
  try {
    const payload = {
      ...req.body
    }
    const { value, error: validationError } = addResturentTableSchema(payload);

    if (validationError) {
      return res.error({
        message: validationError.details.map((e) => e.message).join(", "),
        status: 400
      });
    }
    const dbPayload = {
      ...value,
      is_booked: false
    }
    // Fetch existing highest table number for this restaurant
    const { data: existing } = await supabase
      .from("outlet_tables")
      .select("table_number")
      .eq("outlet_id", value.outlet_id)
      .eq("table_number", value.table_number)
      .limit(1);

    if (Array.isArray(existing) && existing.length > 0)
      return res.error({
        message: "This table already exist in this outlet. please put different table number.",
        status: 400
      });
    const { data, error: dbError } = await supabase
      .from("outlet_tables")
      .insert(dbPayload)
      .select();

    if (dbError) {
      return res.error({
        message: dbError.message,
        status: 400
      });
    }

    return res.status(201).json({
      message: "Table created successfully",
      table: data
    });
  } catch (err) {
    console.error("addResturentTable:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getTablesByOutlet = async (req, res) => {
  try {
    const { outlet_id } = req.params;
    if (!outlet_id) {
      return res.error({
        message: "Outlet id is required",
        status: 400
      });
    }

    const { data, error } = await supabase
      .from("outlet_tables")
      .select("id,table_number, capacity, is_booked, outlet_id, is_active")
      .eq("outlet_id", outlet_id)
      .order("table_number", { ascending: true });

    if (error) return res.error({
      message: "DB error occured during fetching the data",
      status: 400
    });

    return res.success({ data });
  } catch (err) {
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

const toggleTableStatus = async (req, res) => {
  try {
    const { table_id } = req.params;
    const { is_active } = req.body;

    const { data, error } = await supabase
      .from("outlet_tables")
      .update({ is_active })
      .eq("id", table_id)
      .select()
      .single();

    if (error) return res.error({
      message: "DB error occured!",
      status: 400
    });

    return res.status(200).json({
      message: "Table status updated",
      table: data
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
const deleteOutletTable = async (req, res) => {
  try {
    const { table_id } = req.params;

    if (!table_id) {
      return res.error({
        message: "Table id is required",
        status: 400
      });
    }

    // 1️⃣ Check if table exists
    const { data: existingTable, error: fetchError } = await supabase
      .from("outlet_tables")
      .select("id, is_booked")
      .eq("id", table_id)
      .single();

    if (fetchError || !existingTable) {
      return res.error({
        message: "Table not found",
        status: 404
      });
    }

    // 2️⃣ Optional safety: prevent deleting booked table
    if (existingTable.is_booked) {
      return res.error({
        message: "Cannot delete a booked table",
        status: 400
      });
    }

    // 3️⃣ Delete table
    const { error: deleteError } = await supabase
      .from("outlet_tables")
      .delete()
      .eq("id", table_id);

    if (deleteError) {
      return res.error({
        message: "Failed to delete table",
        status: 400
      });
    }

    return res.success({
      message: "Table deleted successfully"
    });

  } catch (err) {
    console.error("deleteOutletTable:", err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

module.exports = {
  addOutletTable,
  getTablesByOutlet,
  toggleTableStatus,
  getAll,
  getDetails,
  update,
  deleteOutletTable
};
