const { GoogleGenerativeAI } = require("@google/generative-ai");
const { petpujaService } = require('../../utils/petpujaService');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// In-memory cache for menu data
const menuCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch complete menu with categories from PetPooja using petpujaService
 * @param {string} restaurantId - Restaurant identifier
 * @returns {Promise<Object>} Menu data with categories and items
 */
async function fetchCompleteMenu(restaurantId) {
    const cacheKey = `menu_${restaurantId}`;
    const cached = menuCache.get(cacheKey);
    
    // Return cached data if valid
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('📦 Using cached menu data');
        return cached.data;
    }

    try {
        console.log('🔄 Fetching fresh menu data from PetPooja...');
        console.log('🔑 Restaurant ID:', restaurantId);
        
        const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
        console.log("🌐 PetPooja URL:", URI);

        const requestBody = { restID: restaurantId };
        const responseData = await petpujaService(URI, requestBody);

        console.log('📦 PetPooja Response structure:', {
            hasSuccess: 'success' in responseData,
            success: responseData?.success,
            hasMessage: 'message' in responseData,
            hasCategories: 'categories' in responseData,
            hasItems: 'items' in responseData,
            topLevelKeys: Object.keys(responseData)
        });

        // Extract categories and items from response
        const categories = responseData?.categories || [];
        const items = responseData?.items || [];

        console.log('📊 PetPooja Data Summary:');
        console.log('  ✓ Success:', responseData?.success);
        console.log('  ✓ Message:', responseData?.message);
        console.log('  ✓ Categories:', categories.length);
        console.log('  ✓ Items:', items.length);

        // Validate data
        if (categories.length === 0) {
            console.error('⚠️ NO CATEGORIES FOUND!');
            console.error('Response keys:', Object.keys(responseData));
            console.error('Full response:', JSON.stringify(responseData));
        }

        if (items.length === 0) {
            console.error('⚠️ NO ITEMS FOUND!');
        }

        // Log first items for debugging
        if (categories.length > 0) {
            console.log('✓ First category:', categories[0].categoryname);
        }
        if (items.length > 0) {
            console.log('✓ First item:', items[0].itemname);
        }

        // Structure menu data - similar to fetchAdminMenuWithCategory
        const menuData = {
            categories: categories
                .filter(cat => cat.active === '1')
                .map(cat => {
                    const categoryId = cat.categoryid;
                    const categoryItems = items.filter(item => 
                        item.item_categoryid == categoryId && item.active === '1'
                    );

                    console.log(`  → Category "${cat.categoryname}": ${categoryItems.length} items`);

                    return {
                        id: categoryId,
                        name: cat.categoryname,
                        active: cat.active,
                        menus: categoryItems.map(item => ({
                            id: item.itemid,
                            name: item.itemname,
                            description: item.itemdescription || item.item_description || '',
                            price: parseFloat(item.price) || 0,
                            active: item.active,
                            isVeg: item.item_attributeid === '1',
                            categoryId: item.item_categoryid,
                            categoryName: cat.categoryname,
                            attributes: item.item_attributename || '',
                            variations: item.variation || []
                        }))
                    };
                })
                .filter(cat => cat.menus.length > 0), // Only include categories with items
            totalItems: items.filter(i => i.active === '1').length,
            restaurantId: restaurantId,
            lastUpdated: new Date().toISOString()
        };

        console.log('✅ Menu processed successfully:');
        console.log('  → Active categories:', menuData.categories.length);
        console.log('  → Total active items:', menuData.totalItems);

        // Update cache
        menuCache.set(cacheKey, {
            data: menuData,
            timestamp: Date.now()
        });

        console.log(`✅ Menu cached for ${CACHE_DURATION / 1000 / 60} minutes`);
        
        return menuData;

    } catch (error) {
        console.error('❌ Error in fetchCompleteMenu:', error.message);
        console.error('Stack:', error.stack);
        
        // Return empty structure on error
        return {
            categories: [],
            totalItems: 0,
            restaurantId: restaurantId,
            lastUpdated: new Date().toISOString(),
            error: error.message
        };
    }
}

/**
 * Create comprehensive system prompt with menu context
 */
function createSystemPrompt(menuData) {
    if (!menuData.categories || menuData.categories.length === 0) {
        console.warn('⚠️ Creating fallback prompt - NO MENU DATA AVAILABLE');
        return `You are the **Bongo Help Buddy**, a friendly and knowledgeable AI assistant for **Bongo Delicacy** restaurant.

🎯 **YOUR ROLE:**
- Welcome customers warmly
- Answer general questions about the restaurant
- Help with party and catering inquiries
- Provide excellent customer service

⚠️ **CURRENT STATUS:**
Our menu is currently being updated. Please apologize for this and let customers know they can:
- Contact the restaurant directly for menu information
- Ask about general information (location, hours, delivery)
- Inquire about party catering options

🎨 **COMMUNICATION STYLE:**
- Be warm, friendly, and apologetic about the menu situation
- Use emojis occasionally 🍽️ 😊
- Keep responses concise and helpful
- Offer to help in other ways

Remember: Provide excellent service even without menu access!`;
    }

    console.log('✅ Creating full prompt with', menuData.categories.length, 'categories');

    // Build menu text with categories and items
    const categoriesText = menuData.categories.map(cat => {
        const itemsList = cat.menus.map(item => {
            const vegSymbol = item.isVeg ? '🟢 VEG' : '🔴 NON-VEG';
            const description = item.description ? ` - ${item.description}` : '';
            const attributes = item.attributes ? ` [${item.attributes}]` : '';
            return `   • ${item.name} - ₹${item.price} (${vegSymbol})${description}${attributes}`;
        }).join('\n');
        
        return `\n📂 ${cat.name.toUpperCase()}\n${itemsList}`;
    }).join('\n');

    const totalCategories = menuData.categories.length;
    const totalItems = menuData.totalItems;
    const vegCount = menuData.categories.reduce((sum, cat) => 
        sum + cat.menus.filter(item => item.isVeg).length, 0
    );
    const nonVegCount = totalItems - vegCount;

    return `You are the **Bongo Help Buddy**, a friendly and knowledgeable AI assistant for **Bongo Delicacy** restaurant. Your mission is to provide excellent customer service through chat.

🎯 **YOUR CAPABILITIES:**

1. **Menu Information & Recommendations**
   - Answer questions about dishes, ingredients, and preparation
   - Suggest items based on preferences (spicy, mild, vegetarian, non-vegetarian)
   - Explain what dishes are popular or special
   - Help customers discover new items they might enjoy

2. **Party & Catering Quotes**
   - Help plan events and gatherings
   - Ask relevant questions: number of guests, date, budget, dietary preferences
   - Suggest appropriate menu combinations for parties
   - Provide estimated costs based on selections

3. **General Restaurant Assistance**
   - Answer questions about ordering, delivery, and policies
   - Provide helpful information about the restaurant
   - Handle special requests professionally

📋 **COMPLETE MENU CATALOG:**
Restaurant has ${totalCategories} categories with ${totalItems} total items (${vegCount} vegetarian, ${nonVegCount} non-vegetarian)

${categoriesText}

🎨 **COMMUNICATION STYLE:**
- Be warm, friendly, and conversational (like a helpful friend)
- Use emojis occasionally to add personality (🍽️ 🌟 😊 👨‍🍳)
- Keep responses concise but informative (max 200 words)
- Show enthusiasm about the food and restaurant
- Be empathetic and understanding of customer needs

💡 **IMPORTANT GUIDELINES:**
- Always base recommendations on the actual menu above
- When mentioning prices, be accurate using the menu data
- If asked about something not on the menu, politely suggest alternatives
- For party quotes, gather: guest count, date, time, budget range, dietary needs, preferred items
- For delivery areas, timings, or specific policies, suggest contacting the restaurant directly
- Never make up information - if you don't know, say so and offer to help in other ways
- Prioritize customer satisfaction and provide excellent service

🍴 **MENU KNOWLEDGE:**
You have complete access to our menu with accurate prices, descriptions, and dietary information. Use this to:
- Recommend specific dishes with confidence
- Compare items when asked
- Suggest complete meals or combinations
- Provide accurate pricing for quotes

Remember: You represent Bongo Delicacy's brand. Be professional, helpful, and make every customer feel valued!`;
}

/**
 * Generate chat response using Gemini API
 */
async function generateChatResponse(history = [], userMessage, restaurantId, userId = null) {
    try {
        console.log('\n🤖 ========== GEMINI CHAT REQUEST ==========');
        console.log('📍 Restaurant ID:', restaurantId);
        console.log('👤 User ID:', userId || 'Guest');
        console.log('💬 User Message:', userMessage);
        console.log('📚 History length:', history.length);
        
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured in environment');
        }

        // Fetch complete menu data
        console.log('\n📖 Fetching menu data...');
        const menuData = await fetchCompleteMenu(restaurantId);
        
        console.log('📊 Menu data loaded:', {
            categories: menuData.categories.length,
            items: menuData.totalItems,
            hasError: !!menuData.error
        });

        // Initialize Gemini model
        const model = genAI.getGenerativeModel(
            { model: "gemini-2.0-flash-exp" }, 
            { apiVersion: 'v1beta' }
        );

        // Create system prompt with menu context
        const systemPrompt = createSystemPrompt(menuData);

        // Format chat history
        const formattedHistory = history.map(msg => {
            const content = msg.parts || msg.content || '';
            const role = msg.role === 'bot' || msg.role === 'model' ? 'Assistant' : 'User';
            return `${role}: ${content}`;
        }).join('\n\n');

        // Build complete prompt
        const fullPrompt = `${systemPrompt}

---

CONVERSATION HISTORY:
${formattedHistory || 'No previous conversation'}

---

USER MESSAGE:
${userMessage}

---

RESPOND AS BONGO HELP BUDDY:`;

        console.log('\n🚀 Sending to Gemini...');
        console.log('📏 Prompt length:', fullPrompt.length);
        
        // Generate response
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const responseText = response.text();

        console.log('✅ Gemini response received');
        console.log('📝 Response length:', responseText.length);
        console.log('========================================\n');

        return {
            role: 'model',
            parts: responseText,
            metadata: {
                menuContext: {
                    categoriesCount: menuData.categories.length,
                    itemsCount: menuData.totalItems,
                    lastUpdated: menuData.lastUpdated,
                    hasError: !!menuData.error
                },
                userId: userId || null,
                model: 'gemini-2.0-flash-exp',
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('❌ GEMINI API ERROR:', error.message);
        console.error('Stack:', error.stack);
        
        if (error.message?.includes('API key')) {
            throw new Error('AI service configuration error. Please contact support.');
        } else if (error.message?.includes('quota')) {
            throw new Error('Service temporarily unavailable. Please try again in a moment.');
        } else if (error.message?.includes('blocked')) {
            throw new Error('Unable to process this request. Please rephrase your message.');
        }
        
        throw new Error(`Failed to generate response: ${error.message}`);
    }
}

/**
 * Clear menu cache
 */
function clearMenuCache(restaurantId = null) {
    if (restaurantId) {
        menuCache.delete(`menu_${restaurantId}`);
        console.log(`🗑️ Cleared cache for restaurant: ${restaurantId}`);
    } else {
        menuCache.clear();
        console.log('🗑️ Cleared all menu cache');
    }
}

module.exports = {
    generateChatResponse,
    fetchCompleteMenu,
    clearMenuCache
};