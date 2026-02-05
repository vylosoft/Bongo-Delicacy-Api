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

module.exports = {
    getAllSchema
}