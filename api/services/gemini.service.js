const { GoogleGenAI, Type } = require("@google/genai");

const apiKey = process.env.VITE_API_KEY;
if (!apiKey) throw new Error("Gemini API key missing");

const ai = new GoogleGenAI({ apiKey });

async function getMealRecommendation(preferences, menu, brandName) {
  const simplifiedMenu = menu.map(m => m.name).join(", ");

  const prompt = `
    You are a friendly restaurant host for ${brandName}.
    The customer likes: ${preferences}
    Menu: ${simplifiedMenu}
    Recommend one dish and give one reason.
  `;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return res.text.trim();
}

async function parseMenuFromText(text) {
  const prompt = `
    Extract menu categories and items (name, description, price).
    Return valid JSON only.
    ---
    ${text}
    ---
  `;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(res.text.trim());
}

module.exports = {
  getMealRecommendation,
  parseMenuFromText,
};
