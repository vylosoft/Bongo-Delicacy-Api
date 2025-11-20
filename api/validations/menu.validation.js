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

module.exports = {
    fetchMenuCatagoryByResturentSchema,
    fetchMenuByCatagorySchema
};