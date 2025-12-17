const Joi = require("joi")

const fetchMenuCatagoryByResturentSchema = params => {
    try {
        return Joi.object({
            resturent_identifier: Joi.string().required().min(3)
        }).validate(params,{ abortEarly: false, stripUnknown: true });
    } catch (error) {
        throw new Error(error);
    }
}

const fetchMenuByCatagorySchema = params => {
    try {
        return Joi.object({
            resturent_identifier: Joi.string().required().min(3),
            category_id: Joi.string().required()
        }).validate(params,{ abortEarly: false, stripUnknown: true });
    } catch (error) {
        throw new Error(error);
    }
}

const fetchAdminMenuWithCategorySchema = params => {
  try {
    return Joi.object({
      resturent_identifier: Joi.string().required().min(3)
    }).validate(params, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    throw new Error(error);
  }
};
const syncRestaurantMenusSchema = params => {
  return Joi.object({
    resturent_identifier: Joi.string().min(3),
    resturent_identifiers: Joi.array()
      .items(Joi.string().min(3))
      .min(1)
      .unique()
  })
    .or('resturent_identifier', 'resturent_identifiers')
    .validate(params, {
      abortEarly: false,
      stripUnknown: true
    });
};
module.exports = {
  fetchMenuCatagoryByResturentSchema,
  fetchMenuByCatagorySchema,
  fetchAdminMenuWithCategorySchema,
  syncRestaurantMenusSchema
};