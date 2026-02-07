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

const addResturentTableSchema = (body) =>
  Joi.object({
    outlet_id: Joi.string().required(),
    table_number: Joi.string().allow("", null),
    capacity: Joi.number().integer().min(1).required(),
  }).validate(body, { abortEarly: false, stripUnknown: true });

const updateOutletTableSchema = body =>{
  return Joi.object({
    id: Joi.string().required(),
    outlet_id: Joi.string().required(),
    table_number: Joi.string().allow("", null),
    capacity: Joi.number().integer().min(1).required(),
    is_active: Joi.boolean().required(),
    is_booked: Joi.boolean().required(),
  }).validate(body, { abortEarly: false, stripUnknown: true });
}

  module.exports = {
    getAllSchema,
    addResturentTableSchema,
    updateOutletTableSchema
  }