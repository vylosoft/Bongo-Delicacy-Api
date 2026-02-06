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

const addResturentTableSchema = (body) =>
  Joi.object({
    outlet_id: Joi.string().required(),
    table_number: Joi.string().allow("", null),
    capacity: Joi.number().integer().min(1).required(),
  }).validate(body, { abortEarly: false, stripUnknown: true });

const getAllSchema = (body) => {
  try {
    const schema = Joi.object({
      page: Joi.number().required(),
      per_page: Joi.number().required()
    });
    return schema.validate(body, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    throw new Error(error);
  }
};

const updateResturent = (body) =>{
   try {
    const schema = Joi.object({
      id: Joi.string().required(),
      tagline: Joi.string().allow(null, ''),
      description: Joi.string().allow(null, ''),
      about_text: Joi.string().allow(null, ''),
      theme_primary: Joi.string().allow(null, ''),
      theme_accent: Joi.string().allow(null, ''),
      theme_text_on_primary: Joi.string().allow(null, '')
    });
    return schema.validate(body, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    throw new Error(error);
  }
}

const imageUploadSchema = (body) =>{
  try {
    const schema = Joi.object({
      id: Joi.string().required().messages({
        "any.required": "Restaurant id is required",
        "string.empty": "Restaurant id is required"
      }),
      type: Joi.string().required().valid("logo", "hero", "about")
      .messages({
        "any.required": "type is required",
        "string.empty": "type is required"
      })
    });
    return schema.validate(body, { abortEarly: false });
  } catch (error) {
    throw new Error(error);
  }
}


module.exports = {
    fetchResturentByMappingIdSchema,
    addResturentSchema,
    addResturentTableSchema,
    getAllSchema,
    updateResturent,
    imageUploadSchema
};