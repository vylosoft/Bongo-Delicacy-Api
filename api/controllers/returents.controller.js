const Joi = require('joi');
const { fetchResturentByMappingIdSchema,  } = require('../validations/resturent.validation');
const { petpujaService } = require('../../utils/petpujaService');

exports.fetchResturentByMappingId = async (req, res) => {
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

