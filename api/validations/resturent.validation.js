const Joi = require("joi")

const fetchResturentByMappingIdSchema = params => {
    try {
        return Joi.object({
            resturent_identifier: Joi.string().required().min(3)
        }).validate(params,{ abortEarly: false, stripUnknown: true });
    } catch (error) {
        throw new Error(error);
    }
}

const addResturentSchema = body =>
  Joi.object({
    rest_id: Joi.string().required().min(3),
    name: Joi.string().required(),
    tagline: Joi.string().allow(''),
    description: Joi.string().allow(''),
    logo: Joi.string().allow(''),
    hero_image: Joi.string().uri().allow(''),
    about_text: Joi.string().allow(''),
    about_image: Joi.string().uri().allow(''),
    theme_primary: Joi.string().allow(''),
    theme_accent: Joi.string().allow(''),
    theme_text_on_primary: Joi.string().allow('')
  }).validate(body, { abortEarly: false, stripUnknown: true });
  const addResturentTableSchema = body =>
  Joi.object({
    table_number: Joi.number().integer().min(1).required(),
    capacity: Joi.number().integer().min(1).required()
  }).validate(body, { abortEarly: false, stripUnknown: true });

module.exports = {
    fetchResturentByMappingIdSchema,
    addResturentSchema,
    addResturentTableSchema
};