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
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getByLocation = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasLocation = !isNaN(lat) && !isNaN(lng);

    const { data, error: dbError } = await supabase
      .from("outlet")
      .select(`*, restaurants(*)`);

    if (dbError) {
      console.log(dbError);
      return res.error({ message: "Error occured during fetching the data", status: 500 });
    }

    let result = data ?? [];

    if (hasLocation) {
      // Attach distance
      result = result.map((o) => ({
        ...o,
        distance_km:
          o.lat != null && o.long != null
            ? Number(getDistanceKm(lat, lng, o.lat, o.long).toFixed(2))
            : null,
      }));

      // Sort: closest first, nulls last
      result.sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) return a.name.localeCompare(b.name);
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });
    } else {
      // No location → sort alphabetically (same as your admin default)
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Attach nearest active alternative to inactive outlets
    const activeOutlets = result.filter((o) => o.is_active);

    result = result.map((o) => {
      if (o.is_active) return o;

      const alternative =
        activeOutlets
          .filter((a) => a.id !== o.id)
          .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))[0] ?? null;

      return {
        ...o,
        alternative: alternative
          ? {
              id: alternative.id,
              name: alternative.name,
              petpooja_outlet_id: alternative.petpooja_outlet_id,
              resturent_id: alternative.resturent_id,
              distance_km: alternative.distance_km,
            }
          : null,
      };
    });

    return res.success({
      data: { result, count: result.length },
    });
  } catch (error) {
    console.log(error);
    return res.error({ message: "Internal server error", status: 500 });
  }
};
module.exports = {
    getAll,
    getDetails,
    uploadOutletImage,
    update,
    getByLocation
}