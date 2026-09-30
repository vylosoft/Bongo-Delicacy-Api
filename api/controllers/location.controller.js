const supabase = require("../../config/db");

// GET ALL LOCATIONS (with pagination)
const getAllLocations = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error: dbError, count } = await supabase
      .from("location")
      .select("id, location_name, lat, long, full_address, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (dbError) {
      console.log(dbError);
      return res.error({
        message: "Error occurred during fetching locations",
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

// GET SINGLE LOCATION BY ID
const getLocationById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.error({
        message: "Location id is required",
        status: 400
      });
    }

    const { data, error: dbError } = await supabase
      .from("location")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) {
      return res.error({ message: "Location not found.", status: 404 });
    }

    if (dbError) {
      return res.error({
        message: "Error occurred during fetching location",
        status: 500
      });
    }

    return res.success({ data });
  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// ADD LOCATION
const addLocation = async (req, res) => {
  try {
    const { location_name, lat, long, full_address } = req.body;

    // Basic validation
    if (!location_name || lat === undefined || long === undefined) {
      return res.error({
        message: "location_name, lat, and long are required",
        status: 400
      });
    }

    if (isNaN(lat) || isNaN(long)) {
      return res.error({
        message: "lat and long must be valid numbers",
        status: 400
      });
    }

    // Check for duplicate location name
    const { data: existing } = await supabase
      .from("location")
      .select("id")
      .ilike("location_name", location_name.trim())
      .limit(1);

    if (Array.isArray(existing) && existing.length > 0) {
      return res.error({
        message: "A location with this name already exists.",
        status: 400
      });
    }

    const { data, error: dbError } = await supabase
      .from("location")
      .insert({
        location_name: location_name.trim(),
        lat: parseFloat(lat),
        long: parseFloat(long),
        full_address: full_address?.trim() || null
      })
      .select()
      .single();

    if (dbError) {
      console.log(dbError);
      return res.error({
        message: dbError.message,
        status: 400
      });
    }

    return res.status(201).json({
      message: "Location added successfully",
      data
    });
  } catch (error) {
    console.error("addLocation:", error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// EDIT / UPDATE LOCATION
const updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { location_name, lat, long, full_address } = req.body;

    if (!id) {
      return res.error({
        message: "Location id is required",
        status: 400
      });
    }

    // Check if location exists
    const { data: existingLocation, error: fetchError } = await supabase
      .from("location")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existingLocation) {
      return res.error({
        message: "Location not found",
        status: 404
      });
    }

    // Build update payload dynamically (only update provided fields)
    const updatePayload = {};
    if (location_name !== undefined) updatePayload.location_name = location_name.trim();
    if (lat !== undefined) {
      if (isNaN(lat)) return res.error({ message: "lat must be a valid number", status: 400 });
      updatePayload.lat = parseFloat(lat);
    }
    if (long !== undefined) {
      if (isNaN(long)) return res.error({ message: "long must be a valid number", status: 400 });
      updatePayload.long = parseFloat(long);
    }
    if (full_address !== undefined) updatePayload.full_address = full_address?.trim() || null;

    if (Object.keys(updatePayload).length === 0) {
      return res.error({
        message: "No fields provided to update",
        status: 400
      });
    }

    const { data, error: dbError } = await supabase
      .from("location")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      console.log(dbError);
      return res.error({
        message: "Update failed.",
        status: 400
      });
    }

    return res.success({ data });
  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// DELETE LOCATION
const deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.error({
        message: "Location id is required",
        status: 400
      });
    }

    // Check if location exists
    const { data: existingLocation, error: fetchError } = await supabase
      .from("location")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existingLocation) {
      return res.error({
        message: "Location not found",
        status: 404
      });
    }

    const { error: deleteError } = await supabase
      .from("location")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return res.error({
        message: "Failed to delete location",
        status: 400
      });
    }

    return res.success({
      message: "Location deleted successfully"
    });
  } catch (error) {
    console.error("deleteLocation:", error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

module.exports = {
  getAllLocations,
  getLocationById,
  addLocation,
  updateLocation,
  deleteLocation
};