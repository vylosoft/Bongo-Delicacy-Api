const { getAllSchema } = require("../validations/outlet.validation");
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
        `*,restaurants (*)`
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

module.exports = {
    getAll,
    getDetails
}