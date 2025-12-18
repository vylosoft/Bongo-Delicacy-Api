const { generateChatResponse } = require('../services/helpBuddy.service');
const Joi = require('joi');

// Validation schema - userId is optional
const helpBuddyChatSchema = Joi.object({
    history: Joi.array().items(
        Joi.object({
            role: Joi.string().valid('user', 'bot', 'model').required(),
            parts: Joi.alternatives().try(Joi.string(), Joi.any()).allow(''),
            content: Joi.alternatives().try(Joi.string(), Joi.any()).allow('')
        })
    ).default([]),
    userMessage: Joi.string().required().trim().min(1).max(1000),
    restaurantId: Joi.string().required(),
    userId: Joi.string().optional().allow(null, '') // Optional userId
});

exports.helpBuddyChat = async (req, res) => {
    try {
        console.log('📥 Help Buddy Chat Request received');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        // Validate request body
        const { error, value } = helpBuddyChatSchema.validate(req.body);
        
        if (error) {
            console.error('❌ Validation error:', error.details);
            return res.status(400).json({
                success: false,
                message: error.details.map(e => e.message).join(', ')
            });
        }

        const { history, userMessage, restaurantId, userId } = value;

        console.log('✅ Validation passed');
        console.log('📍 Restaurant:', restaurantId);
        console.log('👤 User:', userId || 'Guest');
        console.log('💬 Message:', userMessage);
        console.log('📚 History items:', history.length);

        // Generate response using Gemini API with menu context
        const response = await generateChatResponse(
            history, 
            userMessage, 
            restaurantId, 
            userId
        );

        console.log('✅ Response generated successfully');

        return res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('❌ Help Buddy Chat Error:', error);
        console.error('Error stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate response',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};