const Joi = require('joi');

const helpBuddyChatSchema = (data) => {
    const schema = Joi.object({
        history: Joi.array().items(
            Joi.object({
                role: Joi.string().valid('user', 'bot', 'model').required(),
                parts: Joi.string().allow(''),
                content: Joi.string().allow('')
            })
        ).default([]),
        userMessage: Joi.string().required().trim().min(1).max(1000),
        restaurantId: Joi.string().required()
    });

    return schema.validate(data);
};

module.exports = {
    helpBuddyChatSchema
};