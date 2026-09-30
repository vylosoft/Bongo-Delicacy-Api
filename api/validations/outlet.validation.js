const Joi = require("joi");

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

const imageUploadSchema = (body) =>{
  try {
    const schema = Joi.object({
      id: Joi.string().required().messages({
        "any.required": "Outlet id is required",
        "string.empty": "Outlet id is required"
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

const updateOutlet = (body) =>{
   try {
    const schema = Joi.object({
      id: Joi.string().required(),
      tagline: Joi.string().allow(null, ''),
      description: Joi.string().allow(null, ''),
      about_text: Joi.string().allow(null, ''),
      theme_primary: Joi.string().allow(null, ''),
      theme_accent: Joi.string().allow(null, ''),
      theme_text_on_primary: Joi.string().allow(null, ''),
      name: Joi.string().allow(null, ''),
      is_active: Joi.boolean().allow(true, false)
    });
    return schema.validate(body, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    throw new Error(error);
  }
}
module.exports = {
    getAllSchema,
    imageUploadSchema,
    updateOutlet
}