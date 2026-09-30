const Joi = require('joi');

const riderBookingSchema = (data) => {
    const schema = Joi.object({
        resturent_lat:  Joi.number()
                .min(-90)
                .max(90)
                .required()
                .label('Resturent Latitude'),
        resturent_lang: Joi.number()
                .min(-90)
                .max(90)
                .required()
                .label('Resturent Latitude'),
        resturent_name: Joi.string().required(),
        resturent_number: Joi.string().required(),
        resturent_address: Joi.string().required(),
        resturent_city: Joi.string().required(),
        order_id: Joi.string().required(),  
    });

    return schema.validate(data);
};

module.exports = {
    riderBookingSchema
};