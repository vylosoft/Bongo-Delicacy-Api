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



module.exports = {
    fetchResturentByMappingIdSchema,
    
};