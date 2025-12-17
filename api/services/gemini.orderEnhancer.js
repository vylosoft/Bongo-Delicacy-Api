const { GoogleGenAI } = require("@google/genai");

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const generateOrderDescription = async (
  userPreferences,
  orderItems,
  restaurantName
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const items = orderItems
      .map(i => `- ${i.name} x${i.quantity}`)
      .join("\n");

    const prompt = `
You are writing kitchen instructions for restaurant staff.

USER PREFERENCES:
Likes: ${userPreferences.likes}
Dislikes: ${userPreferences.dislikes}
Allergies: ${userPreferences.allergies}

PAST FEEDBACK:
${userPreferences.feedback || "None"}

CURRENT ORDER:
${items}

RESTAURANT:
${restaurantName}

RULES:
- Be precise
- Mention allergies clearly
- Adjust taste based on feedback
- Max 80 words

Return ONLY JSON:
{
  "orderDescription": "text"
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { description: parsed.orderDescription };
    }

    return { description: text };
  } catch (err) {
    console.error("Gemini error:", err);
    return generateFallback(userPreferences);
  }
};

const generateFallback = (prefs) => {
  const parts = [];
  if (prefs.allergies) parts.push(`Avoid ${prefs.allergies}`);
  if (prefs.dislikes) parts.push(`Avoid ${prefs.dislikes}`);
  return {
    description: parts.join(". ") || "No special instructions",
  };
};

module.exports = { generateOrderDescription };
