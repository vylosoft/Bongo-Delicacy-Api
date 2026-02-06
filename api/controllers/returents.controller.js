const multer = require("multer");
const {
  fetchResturentByMappingIdSchema,
  addResturentSchema,
  addResturentTableSchema,
  updateResturent,
  imageUploadSchema
} = require("../validations/resturent.validation");
const { petpujaService } = require("../../utils/petpujaService");
const supabase = require("../../config/db");

const upload = multer({ storage: multer.memoryStorage() });
const { getAllSchema } = require("../validations/resturent.validation");
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_IMAGE = "https://via.placeholder.com/400x300?text=No+Image";

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
    } = await supabase.from("restaurants").select("*", { count: "exact" }).range(from, to);
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
    const uuid = req.params.uuid;

    const { data, error: dbError } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", uuid)
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

const uploadRestaurantImage = async (req, res) => {
  try {
    const payload = {
      ...req.body
    }

    const {value, error: validationError } = imageUploadSchema(payload);
    const { id, type } = value;
    if (validationError) {
          return res.error({
            message: validationError.details.map((e) => e.message).join(", "),
            status: 400
          });
        }
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const filePath = `restaurants/${id}/${type}-${Date.now()}.${ext}`;

    // IMPORTANT: use a real bucket name
    const BUCKET = process.env.RESTURENT_BUCKET_NAME;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true
    });

    if (upErr) return res.status(400).json({ error: upErr.message });

    const updatePayload = {};
    if (value.type === "logo") updatePayload.logo = filePath;
    if (value.type === "hero") updatePayload.hero_image = filePath;
    if (value.type === "about") updatePayload.about_image = filePath;

    const { data: dbData, error:dbError } = await supabase
      .from("restaurants")
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

const fetchResturentByMappingId = async (req, res) => {
  try {
    const reqBody = { ...req.query };
    const validateSchema = fetchResturentByMappingIdSchema(reqBody);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map((e) => e.message).join(", "),
        status: 400
      });
    }

    const { resturent_identifier } = validateSchema.value;

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const responseData = await petpujaService(URI, { restID: resturent_identifier });

    return res.success({ data: responseData.restaurants });
  } catch (err) {
    return res.error({ message: "Internal server error" });
  }
};

// const addResturent = async (req, res) => {
//   try {
//     const { error } = addResturentSchema(req.body);
//     if (error) return res.status(400).json({ error: error.details[0].message });

//     const {
//       rest_id,
//       name,
//       tagline,
//       description,
//       logo,
//       hero_image,
//       about_text,
//       about_image,
//       theme_primary,
//       theme_accent,
//       theme_text_on_primary,
//       Latitude,
//       Longitude
//     } = req.body;

//     const petpujaUrl = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
//     const petRes = await petpujaService(petpujaUrl, { restID: rest_id });

//     if (!petRes?.restaurants?.length) {
//       return res.status(404).json({ error: "Restaurant not found in PetPuja" });
//     }

//     const payload = {
//       rest_id,
//       name,
//       tagline,
//       description,
//       logo,
//       hero_image,
//       about_text,
//       about_image,
//       theme_primary,
//       theme_accent,
//       theme_text_on_primary,
//       Latitude,
//       Longitude
//     };

//     const { data, error: dbError } = await supabase
//       .from("restaurants")
//       .insert([payload])
//       .select()
//       .single();

//     if (dbError) return res.status(400).json({ error: dbError.message });

//     return res.status(201).json({
//       message: "Restaurant created successfully",
//       restaurant: data
//     });
//   } catch (err) {
//     console.error("addResturent:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

const update = async (req, res) => {
  try {
    const requestPayload = {
      ...req.body,
      ...req.params
    }
    // validation rules
    const { value, error: validationError } = updateResturent(requestPayload);
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
      .from("restaurants")
      .update(payload)
      .eq("id", value.id)
      .select();

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

const addResturentTable = async (req, res) => {
  try {
    const rest_id = req.params.rest_id;
    if (!rest_id) return res.status(400).json({ error: "rest_id is required" });

    const { value, error } = addResturentTableSchema(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const requestedNumber = Number(value.table_number);
    const capacity = Number(value.capacity);

    // Fetch existing highest table number for this restaurant
    const { data: existing } = await supabase
      .from("restaurant_tables")
      .select("table_number")
      .eq("rest_id", rest_id)
      .order("table_number", { ascending: false })
      .limit(1);

    let finalTableNumber = requestedNumber;

    // If requested number exists or lower, increment
    if (existing && existing.length > 0 && existing[0].table_number >= requestedNumber) {
      finalTableNumber = existing[0].table_number + 1;
    }

    const table_name = `Table ${finalTableNumber}`;

    const payload = {
      rest_id,
      table_number: finalTableNumber,
      capacity,
      table_name,
      is_active: true
    };

    const { data, error: dbError } = await supabase
      .from("restaurant_tables")
      .insert([payload])
      .select();

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({
      message: "Table added successfully",
      table: data[0]
    });
  } catch (err) {
    console.error("addResturentTable:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getTablesByRestaurant = async (req, res) => {
  try {
    const { rest_id } = req.params;
    if (!rest_id) return res.status(400).json({ error: "rest_id is required" });

    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("rest_id", rest_id)
      .order("table_number", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ tables: data });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
const toggleTableStatus = async (req, res) => {
  try {
    const { table_id } = req.params;
    const { is_active } = req.body;

    const { data, error } = await supabase
      .from("restaurant_tables")
      .update({ is_active })
      .eq("id", table_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({
      message: "Table status updated",
      table: data
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  fetchResturentByMappingId,
  addResturent,
  addResturentTable,
  getTablesByRestaurant,
  toggleTableStatus,
  uploadRestaurantImage,
  getAll,
  getDetails,
  update
};
