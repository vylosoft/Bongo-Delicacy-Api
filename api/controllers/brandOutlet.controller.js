const supabase = require("../../config/db");

// ==========================
// ✅ ADD BRAND OUTLET
// ==========================
const addBrandOutlet = async (req, res) => {
  try {
    const { outlet_id, brand_id, location_id } = req.body;

    // 1. validation
    if (!outlet_id || !brand_id || !location_id) {
      return res.error({
        message: "outlet_id, brand_id and location_id are required",
        status: 400
      });
    }

    // 2. check outlet exists
    const { data: outlet, error: outletError } = await supabase
      .from("outlet")
      .select("id, brand_id")
      .eq("id", outlet_id)
      .single();

    if (outletError || !outlet) {
      return res.error({
        message: "Outlet not found",
        status: 404
      });
    }

    // 🚫 prevent assigning to another brand
    if (outlet.brand_id) {
      return res.error({
        message: "Outlet already assigned to a brand",
        status: 400
      });
    }

    // 3. get brand
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (brandError || !brand) {
      return res.error({
        message: "Brand not found",
        status: 404
      });
    }

    // 4. get location
    const { data: location, error: locError } = await supabase
      .from("location")
      .select("*")
      .eq("id", location_id)
      .single();

    if (locError || !location) {
      return res.error({
        message: "Location not found",
        status: 404
      });
    }

    // 5. update outlet (main logic)
    const payload = {
      brand_id: brand.id,
      brand_name: brand.brand_name,

      lat: location.lat,
      long: location.long,
      address: location.full_address,
      city: location.location_name,
      // brand data copy
      logo: brand.logo,
      hero_image: brand.hero_image,
      about_image: brand.about_image,
      about_text: brand.about_text,

      theme_primary: brand.primary_color,
      theme_accent: brand.accent_color,
      theme_text_on_primary: brand.text_color_on_primary
    };

    const { data, error } = await supabase
      .from("outlet")
      .update(payload)
      .eq("id", outlet_id)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Failed to assign outlet",
        status: 400
      });
    }

    // 6. optional mapping table (for tracking)
    await supabase.from("brand_outlet").insert({
      brand_id,
      outlet_id,
      location_id
    });

    return res.success({
      data,
      message: "Outlet assigned successfully"
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
// ✅ GET ALL BRAND OUTLETS
// ==========================
const getAllBrandOutlets = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("brand_outlet")
      .select(`
        id,
        brand_id,
        outlet_id,
        location_id,
        outlet:outlet_id (*),
        brand:brand_id (id, brand_name)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.error({
        message: "Error fetching data",
        status: 500
      });
    }

    return res.success({ data });

  } catch (err) {
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// ==========================
// ✅ GET OUTLETS BY BRAND
// ==========================
const getOutletsByBrand = async (req, res) => {
  try {
    const brandId = req.params.brand_id;

    const { data, error } = await supabase
      .from("outlet")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.error({
        message: "Failed to fetch outlets",
        status: 500
      });
    }

    return res.success({
      data: {
        result: data,
        count: data.length
      }
    });

  } catch (err) {
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// ==========================
// ✅ REMOVE BRAND OUTLET
// ==========================
const removeBrandOutlet = async (req, res) => {
  try {
    const outlet_id = req.params.id;

    // reset outlet
    const { error } = await supabase
      .from("outlet")
      .update({
        brand_id: null,
        brand_name: null
      })
      .eq("id", outlet_id);

    if (error) {
      return res.error({
        message: "Failed to remove outlet",
        status: 400
      });
    }

    return res.success({
      message: "Outlet removed from brand"
    });

  } catch (err) {
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

module.exports = {
  addBrandOutlet,
  getAllBrandOutlets,
  getOutletsByBrand,
  removeBrandOutlet
};