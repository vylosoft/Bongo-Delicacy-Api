const { getAllSchema, imageUploadSchema, updateOutlet} = require("../validations/outlet.validation");
const supabase = require("../../config/db");

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
    } = await supabase.from("outlet").select( `*,restaurants(*)`, { count: "exact" }).range(from, to);
    
    if (dbError) {
      console.log(dbError)
      return res.error({
        message: "Error occured during fetching the data",
        status: 500
      });
    }
    return res.success({ data: { result: data, count }});
  } catch (error) {
    console.log(error)
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

const getDetails = async(req,res) =>{
  try {
    const uuid = req.params.uuid;

    const { data, error: dbError } = await supabase
      .from("outlet")
      .select(
        `id,
        resturent_id,
        is_active,
        petpooja_outlet_id,
        contact,
        address,
        city,
        state,
        logo,
        hero_image,
        about_image,
        about_text,
        theme_primary,
        theme_accent,
        theme_text_on_primary,
        name,
        tagline,
        description,
        restaurants (id, name, description, tagline)`
      )
      .eq("id", uuid)
      .single();

    if (dbError) {
      console.log(dbError);
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
}

const uploadOutletImage = async (req, res) => {
  try {
    const payload = {
      ...req.body
    }

    const {value, error: validationError } = imageUploadSchema(payload);
    
    if (validationError) {
          return res.error({
            message: validationError.details.map((e) => e.message).join(", "),
            status: 400
          });
        }
    const { id, type } = value;
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const filePath = `outlets/${id}/${type}-${Date.now()}.${ext}`;

    // IMPORTANT: use a real bucket name
    const BUCKET = 'restaurant-images';

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true
    });

    if (upErr) {
      console.log(upErr);
      return res.error({
        message: upErr.message,
        status: 400
      });
    } 

    const updatePayload = {};
    if (value.type === "logo") updatePayload.logo = filePath;
    if (value.type === "hero") updatePayload.hero_image = filePath;
    if (value.type === "about") updatePayload.about_image = filePath;

    const { data: dbData, error:dbError } = await supabase
      .from("outlet")
      .update(updatePayload)
      .eq("id", value.id)
      .select()
      .single();

    // public url (works only if bucket is public)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const publicUrl = process.env.SUPABASE_URL+ "/storage/v1/object/public/" + BUCKET + filePath;
    return res.success({ data:  data.publicUrl,  message: "Image uploded successfully", path: publicUrl });
  } catch (err) {
    console.error("uploadRestaurantImage:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const update = async (req, res) => {
  try {
    const requestPayload = {
      ...req.body,
      ...req.params
    }
    // validation rules
    const { value, error: validationError } = updateOutlet(requestPayload);
    // Return validation error.
    if (validationError) {
      return res.error({
        message: validationError.details.map((e) => e.message).join(", "),
        status: 400
      });
    }
    const payload = value;
    // update the data
    const { data, error: dbError} = await supabase
      .from("outlet")
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

    return res.success({ data: data, message: "Outlet update successful" });

  } catch (error) {
    console.log(error);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};
module.exports = {
    getAll,
    getDetails,
    uploadOutletImage,
    update
}