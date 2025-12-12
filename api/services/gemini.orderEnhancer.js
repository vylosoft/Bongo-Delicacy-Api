const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Gemini API key missing");

const genAI = new GoogleGenAI({ apiKey });

/**
 * Generate order description for restaurant based on user preferences
 * @param {Object} userPreferences - User's dietary preferences and feedback
 * @param {Array} orderItems - Items in current order
 * @param {String} restaurantName - Name of the restaurant
 * @returns {Promise<String>} - AI generated description
 */
const generateOrderDescription = async (userPreferences, orderItems, restaurantName) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Build item list
    const itemsList = orderItems
      .map(item => `- ${item.name} (Qty: ${item.quantity})`)
      .join("\n");

    const prompt = `
You are a helpful assistant that creates clear, concise order notes for restaurants.

CUSTOMER PREFERENCES:
- Likes: ${userPreferences.likes || "Not specified"}
- Dislikes: ${userPreferences.dislikes || "Not specified"}
- Allergies: ${userPreferences.allergies || "Not specified"}
- Past Feedback: ${userPreferences.feedback || "No previous feedback"}

CURRENT ORDER ITEMS:
${itemsList}

RESTAURANT: ${restaurantName}

Create a SHORT, ACTIONABLE description (max 150 words) for the restaurant staff that:
1. Highlights critical allergies or dietary restrictions
2. Mentions important preparation preferences
3. References past feedback if relevant to current items
4. Uses professional, polite language

Format: Direct instructions without extra formatting or headers.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const description = response.text().trim();

    return description;

  } catch (error) {
    console.error("AI Description Generation Error:", error);
    // Fallback to basic description
    return generateFallbackDescription(userPreferences);
  }
};

/**
 * Fallback description if AI fails
 */
const generateFallbackDescription = (userPreferences) => {
  const parts = [];
  
  if (userPreferences.allergies) {
    parts.push(`⚠️ ALLERGIES: ${userPreferences.allergies}`);
  }
  
  if (userPreferences.dislikes) {
    parts.push(`Avoid: ${userPreferences.dislikes}`);
  }
  
  if (userPreferences.likes) {
    parts.push(`Prefers: ${userPreferences.likes}`);
  }

  return parts.length > 0 
    ? parts.join(" | ") 
    : "No special instructions";
};

module.exports = { generateOrderDescription };