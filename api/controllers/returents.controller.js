const Joi = require('joi');
const { fetchResturentByMappingIdSchema,addResturentSchema   } = require('../validations/resturent.validation');
const { petpujaService } = require('../../utils/petpujaService');
const { supabase } = require('../models/resturent.model');
const fetchResturentByMappingId = async (req, res) => {
    try {
        const reqBody = {
            ...req.query
        }
        const validateSchema = fetchResturentByMappingIdSchema(reqBody);
        if (validateSchema.error) {
            return res.error({ message: validateSchema.error.details.map(e => e.message).join(', '), status: 400 });
        }
        const reqData = validateSchema.value;
        const { resturent_identifier } = reqData;
        try {
            const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
            const requestBody = {
                restID: resturent_identifier
            }
            const responseData = await petpujaService(URI, requestBody);
            console.log(responseData);
         const resturent = responseData.restaurants;


            return res.success({ data: resturent });
        } catch (error) {
            console.log(error);
            return res.error({ message: 'Something went wrong' });
        }
    } catch (err) {
        return res.error({ message: 'Internal server error' });
    }
};
const addResturent = async (req, res, next) => {
  try {
    const { error, value } = addResturentSchema(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { data, error: dbError } = await supabase
      .from('restaurants')
      .insert([value])
      .select();

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({
      message: 'Restaurant created successfully',
      restaurant: data[0]
    });
  } catch (err) {
    next(err);
  }
};



const addResturentTable = async (req, res, next) => {
  try {
    const rest_id = req.params.rest_id;
    if (!rest_id) return res.status(400).json({ error: 'rest_id is required' });

    const { error, value } = addResturentTableSchema(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const payload = { rest_id, ...value };

    const { data, error: dbError } = await supabase
      .from('restaurant_tables')
      .insert([payload])
      .select();

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({
      message: 'Table added successfully',
      table: data[0]
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    fetchResturentByMappingId,
    addResturent,
    addResturentTable
}