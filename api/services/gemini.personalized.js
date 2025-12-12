const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Gemini API key missing");

const ai = new GoogleGenAI({ apiKey });

async function getPersonalizedMealRecommendations(userProfile, userMessage, menu, brandName) {
  const likes = userProfile?.likes || "none";
  const dislikes = userProfile?.dislikes || "none";
  const allergies = userProfile?.allergies || "none";
  const feedback = userProfile?.feedback || "none";

  const menuText = menu
    .map(item => `${item.name}: ${item.description || ""}`)
    .join("\n");

  const prompt = `
You are a thoughtful food recommendation assistant for ${brandName}.

USER PROFILE:
Likes: ${likes}
Dislikes: ${dislikes}
Allergies: ${allergies}
Feedback history: ${feedback}

User message: "${userMessage}"

USER MESSAGE CHECK:
If the user did not provide any message or the message is empty:
- Recommend 2–4 dishes based purely on the user's taste profile.
- Keep recommendations friendly, direct, and helpful.

If the message IS related to food, cravings, flavors, hunger, ingredients, or diet preferences:
- Use both the message AND the user's saved preferences.

MENU:
${menuText}

TASK RULES:
- Recommend 2 to 4 dishes.
- Each dish MUST be on its own separate line.
- Format each line exactly as:
  <Dish Name>: <One natural sentence explaining why it fits>
- Avoid dishes containing anything the user dislikes or is allergic to.
- Consider feedback history:
  - Suggest dishes similar to what the user enjoyed before.
  - Avoid dishes similar to items the user previously disliked.
- The response must be plain text only.
- Do NOT use bullet points, numbering, or JSON.
- Keep explanations short, clear, and natural.

Example style:
Paneer Tikka: Smoky and mildly spicy, matching your past preferences without being oily.
Dal Achari: A tangy, lighter option that avoids your dislikes while staying flavorful.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });

  return response.text.trim();
}

module.exports = {
  getPersonalizedMealRecommendations
};
