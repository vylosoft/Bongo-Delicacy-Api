const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Gemini API key missing");

const ai = new GoogleGenAI({ apiKey });

async function getMealRecommendation(preferences, menu, brandName) {
  const simplifiedMenu = menu
    .map(item => `${item.name} – ${item.description || ""}`)
    .join(", ");

  const prompt = `
You are a friendly and knowledgeable restaurant host for "${brandName}".

The customer said: "${preferences}"

Step 1 — Detect intent:
- If the message is NOT about food, flavors, cravings, ingredients, eating, or dietary preferences:
    Return ONLY this sentence:
    "I can help you choose a dish, but tell me what kind of food you're craving."

Step 2 — If the message IS food-related:
- Recommend exactly ONE dish from this menu: ${simplifiedMenu}
- Start with: "I recommend the <Dish Name>!"
- Follow with one friendly sentence explaining why.
- Output ONLY the natural sentence. No JSON.

Example tone:
"I recommend the Chicken Biryani! It's aromatic, comforting, and fits perfectly with your craving."
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });

  return response.text.trim();
}

module.exports = {
  getMealRecommendation
};
