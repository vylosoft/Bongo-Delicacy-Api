const supabase = require("../../config/db");

// ==========================
// ✅ ADD BRAND
// ==========================
const addBrand = async (req, res) => {
  try {
    const payload = {
      ...req.body
    };

    const { data, error } = await supabase
      .from("brands")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Brand creation failed",
        status: 400
      });
    }

    return res.success({
      data,
      message: "Brand created successfully"
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const getAllBrands = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await supabase
      .from("brands")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("id", { ascending: false });

    if (error) {
      console.log(error);
      return res.error({
        message: "Error fetching brands",
        status: 500
      });
    }

    return res.success({
      data: { result: data, count }
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const getBrandDetails = async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.log(error);
      return res.error({
        message: "Brand not found",
        status: 404
      });
    }

    return res.success({ data });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const updateBrand = async (req, res) => {
  try {
    const id = req.params.id;

    const payload = {
      ...req.body
    };

    const { data, error } = await supabase
      .from("brands")
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
      message: "Brand updated successfully"
    });
  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
const uploadBrandImage = async (req, res) => {
  try {
    const { id, type } = req.body; 
    // type = logo | hero | about

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();

    const filePath = `brands/${id}/${type}-${Date.now()}.${ext}`;

    const BUCKET = "restaurant-images";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.log(uploadError);
      return res.error({
        message: uploadError.message,
        status: 400
      });
    }

    // ✅ Update DB column
    const updatePayload = {};
    if (type === "logo") updatePayload.logo = filePath;
    if (type === "hero") updatePayload.hero_image = filePath;
    if (type === "about") updatePayload.about_image = filePath;

    const { error: dbError } = await supabase
      .from("brands")
      .update(updatePayload)
      .eq("id", id);

    if (dbError) {
      console.log(dbError);
    }

    // ✅ Public URL
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return res.success({
      data: data.publicUrl,
      path: filePath,
      message: "Image uploaded successfully"
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
  addBrand,
  getAllBrands,
  getBrandDetails,
  updateBrand,
  uploadBrandImage
};