const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../../config/db");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ================== COMPLAINT EXTRACTION ================== */

/**
 * Extract complaint text from ANY format
 */
function extractComplaintText(complaint) {
  if (!complaint) return "";

  try {
    if (typeof complaint === "string") {
      try {
        const parsed = JSON.parse(complaint);
        return extractComplaintText(parsed);
      } catch {
        return complaint.trim();
      }
    }

    if (typeof complaint === "object") {
      const textFields = [
        complaint.comments,
        complaint.comment,
        complaint.message,
        complaint.description,
        complaint.reason,
        complaint.issue,
        complaint.feedback,
        complaint.text,
        complaint.body,
        complaint.complaint,
      ];

      for (const field of textFields) {
        if (field && typeof field === "string" && field.trim()) {
          return field.trim();
        }
      }

      return JSON.stringify(complaint);
    }

    return String(complaint).trim();

  } catch (error) {
    console.error("[COMPLAINT] Extraction failed:", error);
    return String(complaint || "").trim();
  }
}

/**
 * Combine all feedback sources into one coherent text
 */
function aggregateFeedback(feedbackArray = [], complaints = []) {
  const allFeedback = [];

  if (Array.isArray(feedbackArray)) {
    feedbackArray.forEach(fb => {
      if (fb && typeof fb === "string" && fb.trim()) {
        allFeedback.push(fb.trim());
      }
    });
  }

  if (Array.isArray(complaints)) {
    complaints.forEach(complaint => {
      const text = extractComplaintText(complaint);
      if (text) {
        allFeedback.push(text);
      }
    });
  } else if (complaints) {
    const text = extractComplaintText(complaints);
    if (text) {
      allFeedback.push(text);
    }
  }

  const unique = [...new Set(allFeedback)];
  return unique.join(". ");
}

/* ================== AI-POWERED DYNAMIC ANALYSIS ================== */

/**
 * AI analyzes ANY type of feedback/complaint dynamically
 */
async function analyzeCustomerFeedback(dishName, combinedFeedback) {
  if (!combinedFeedback || combinedFeedback.trim().length === 0) {
    return null;
  }

  const prompt = `You are an expert restaurant quality analyst. Analyze customer complaints and extract actionable kitchen instructions.

DISH: ${dishName}

CUSTOMER COMPLAINT:
"${combinedFeedback}"

Your task:
1. Identify ALL issues mentioned (taste, texture, temperature, portion, quality, presentation, etc.)
2. Determine root causes of these issues
3. Provide specific, actionable corrections for kitchen staff
4. Rate severity (low/medium/high)

Return ONLY valid JSON:
{
  "issues": ["brief issue 1", "brief issue 2"],
  "rootCauses": ["why issue 1 happened", "why issue 2 happened"],
  "corrections": ["specific fix 1", "specific fix 2"],
  "severity": "low|medium|high",
  "customerSentiment": "angry|disappointed|neutral|satisfied"
}

EXAMPLES:

Input: "too sweet, bad food"
{
  "issues": ["excessive sweetness", "poor overall taste"],
  "rootCauses": ["too much sugar added", "improper seasoning balance"],
  "corrections": ["reduce sugar by 40%", "balance sweetness with salt and spices"],
  "severity": "high",
  "customerSentiment": "disappointed"
}

Input: "too sweet. less quantity"
{
  "issues": ["excessive sweetness", "insufficient portion"],
  "rootCauses": ["too much sugar", "inadequate serving size"],
  "corrections": ["reduce sugar by 35%", "increase to standard 150g serving"],
  "severity": "medium",
  "customerSentiment": "disappointed"
}

Input: "pathetic quality, stale taste, waste of money"
{
  "issues": ["stale ingredients", "poor quality", "bad value"],
  "rootCauses": ["old or expired ingredients", "improper storage", "lack of freshness"],
  "corrections": ["use only fresh ingredients", "check expiry dates", "prepare fresh batch"],
  "severity": "high",
  "customerSentiment": "angry"
}

Input: "not enough gravy, dry chicken"
{
  "issues": ["insufficient gravy", "dry chicken texture"],
  "rootCauses": ["less gravy added", "chicken overcooked"],
  "corrections": ["add 50% more gravy", "reduce cooking time to keep chicken moist"],
  "severity": "medium",
  "customerSentiment": "disappointed"
}

Now analyze the complaint above and return JSON:`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
      }
    });

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    if (!analysis.issues || !analysis.corrections) {
      throw new Error("Invalid analysis structure");
    }

    return analysis;

  } catch (error) {
    console.error("[AI] Analysis failed:", error);
    console.error("[AI] Feedback was:", combinedFeedback);

    return {
      issues: ["quality concerns based on previous feedback"],
      rootCauses: ["issues with preparation or ingredients"],
      corrections: [
        "prepare with extra care and attention",
        "use fresh, quality ingredients",
        "ensure proper cooking standards"
      ],
      severity: "medium",
      customerSentiment: "disappointed"
    };
  }
}

/**
 * Generate professional kitchen instruction
 */
async function generateKitchenInstruction(
  dishName,
  analysis,
  userPreferences
) {
  // No past issues - basic instruction with preferences
  if (!analysis) {
    const parts = [`Prepare ${dishName}`];

    if (userPreferences.allergies) {
      parts.push(`⚠️ ALLERGEN ALERT: Do not use ${userPreferences.allergies}`);
    }

    if (userPreferences.dislikes) {
      parts.push(`Avoid: ${userPreferences.dislikes}`);
    }

    // if (userPreferences.likes) {
    //   parts.push(`Customer prefers: ${userPreferences.likes}`);
    // }

    return parts.join(". ") + ".";
  }

  const { issues, corrections, severity, customerSentiment } = analysis;

  const urgency = severity === "high"
    ? "⚠️ HIGH PRIORITY"
    : severity === "medium"
      ? "⚡ ATTENTION NEEDED"
      : "ℹ️ NOTE";

  const prompt = `You are a restaurant kitchen manager writing instructions for your team. A repeat customer had issues before.

${urgency}

DISH: ${dishName}

PREVIOUS PROBLEMS:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}

REQUIRED FIXES:
${corrections.map((fix, i) => `${i + 1}. ${fix}`).join("\n")}

CUSTOMER MOOD: ${customerSentiment}

DIETARY RESTRICTIONS:
- Allergies: ${userPreferences.allergies || "None"}
- Dislikes: ${userPreferences.dislikes || "None"}  
- Preferences: ${userPreferences.likes || "None"}

Write a clear, professional instruction (2-4 sentences) that:
1. MUST start with urgency level (${urgency})
2. Acknowledges WHAT went wrong specifically
3. Lists EXACT corrections with clear kitchen actions (no percentages or numeric reductions)
4. Includes allergen warnings if any (use ⚠️ symbol)
5. Includes customer preferences if relevant
6. Professional but urgent tone

Format: "${urgency} - Prepare [dish]. Last order had [issues]. This time: [specific fixes]. [Allergen warning]. [Preferences]."

Examples:

"⚠️ HIGH PRIORITY - Prepare Chicken Biryani with EXTRA CARE. Last order was too oily and chicken was undercooked. This time: reduce oil by 50%, cook chicken thoroughly until tender, and check temperature before packing. ⚠️ ALLERGEN: Do not use peanuts. Customer prefers extra spicy."

"⚡ ATTENTION NEEDED - Prepare Dal Makhani. Previous order was too salty. This time: reduce salt by 20% and taste before serving. Avoid onions (customer dislikes)."

"⚠️ HIGH PRIORITY - Prepare Paneer Tikka. Customer complained last time about stale taste and small portion. Use ONLY FRESH paneer, increase portion to 250g, and ensure proper marination. ⚠️ ALLERGEN: No dairy substitutes, use real paneer only."

"⚡ ATTENTION NEEDED - Prepare Aloo Aur Pudina Raita. Last order was too sweet and portion was insufficient. This time: reduce sugar by 35%, increase portion to 150g standard serving, balance sweetness with yogurt and mint. Customer likes cooling dishes."

Write the instruction:`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      }
    });

    const result = await model.generateContent(prompt);
    let instruction = result.response.text().trim();

    // Clean markdown
    instruction = instruction
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/\*\*/g, "")
      .trim();

    // Verify urgency marker is present
    if (!instruction.includes("⚠️") && !instruction.includes("⚡") && !instruction.includes("ℹ️")) {
      console.warn("[AI] Adding missing urgency marker");
      instruction = `${urgency} - ${instruction}`;
    }

    console.log("[AI] Generated instruction:", instruction);

    return instruction;

  } catch (error) {
    console.error("[AI] Instruction generation failed:", error);

    // Enhanced fallback
    const parts = [];

    if (severity === "high") {
      parts.push(`⚠️ HIGH PRIORITY - Prepare ${dishName} with EXTRA CARE.`);
    } else if (severity === "medium") {
      parts.push(`⚡ ATTENTION NEEDED - Prepare ${dishName}.`);
    } else {
      parts.push(`ℹ️ Prepare ${dishName}.`);
    }

    if (issues.length > 0) {
      parts.push(`Last order had: ${issues.join(", ")}.`);
    }

    if (corrections.length > 0) {
      parts.push(`This time: ${corrections.join(", ")}.`);
    }

    if (userPreferences.allergies) {
      parts.push(`⚠️ ALLERGEN: Do not use ${userPreferences.allergies}.`);
    }

    if (userPreferences.dislikes) {
      parts.push(`Avoid: ${userPreferences.dislikes}.`);
    }

    // if (userPreferences.likes) {
    //   parts.push(`Customer prefers: ${userPreferences.likes}.`);
    // }

    return parts.join(" ");
  }
}

/* ================== MAIN FUNCTION ================== */

function normalizeList(text = "") {
  return text
    .toLowerCase()
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

function extractIngredientsFromItem(item) {
  return `
    ${item.name || ""}
    ${item.itemname || ""}
    ${item.itemdescription || ""}
  `.toLowerCase();
}

async function generateOrderDescription(
  userPreferences,
  orderItems,
  pastItemFeedback
) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return { description: "", metadata: [] };
  }

  if (!Array.isArray(pastItemFeedback)) {
    pastItemFeedback = [];
  }

  const descriptions = [];
  const metadata = [];

  const dislikedList = normalizeList(userPreferences.dislikes);
  const allergyList = normalizeList(userPreferences.allergies);
  const likesText = userPreferences.likes || "";
const preferenceLines = [];

if (userPreferences.allergies && userPreferences.allergies.trim()) {
  preferenceLines.push(
    `⚠️ ALLERGEN ALERT: Do not use ${userPreferences.allergies}.`
  );
}

if (userPreferences.dislikes && userPreferences.dislikes.trim()) {
  preferenceLines.push(`Avoid: ${userPreferences.dislikes}.`);
}

if (userPreferences.likes && userPreferences.likes.trim()) {
  preferenceLines.push(`Customer prefers: ${userPreferences.likes}.`);
}
  for (const item of orderItems) {
    const itemId = String(item.itemid || item.id || "").trim();
    const dishName = item.name || item.itemname || "this dish";
    const normalizedDishName = dishName.toLowerCase().trim();

    /* ---------------- MATCH FEEDBACK ---------------- */

    const itemFeedback = pastItemFeedback.filter(f =>
      (f.itemId && itemId && f.itemId === itemId) ||
      (f.itemName &&
        f.itemName.toLowerCase().trim() === normalizedDishName)
    );

    const feedbackTexts = itemFeedback
      .map(f => f.feedback)
      .filter(Boolean);

    const complaints = itemFeedback
      .map(f => f.complaint)
      .filter(Boolean);

    const combinedFeedback = aggregateFeedback(
      feedbackTexts,
      complaints
    ).toLowerCase();

    /* ---------------- DETERMINE ISSUES (NO AI) ---------------- */

    const issues = [];

    if (combinedFeedback.includes("sweet")) {
      issues.push("too sweet");
    }

    if (
      combinedFeedback.includes("less quantity") ||
      combinedFeedback.includes("quantity")
    ) {
      issues.push("the portion size was insufficient");
    }

    /* ---------------- BUILD FIXES ---------------- */

    const fixes = [];

    if (issues.includes("too sweet")) {
      fixes.push("reduce sweetness");
      fixes.push("balance yogurt with mint and salt");
    }

    if (issues.includes("the portion size was insufficient")) {
      fixes.push("serve a full standard portion");
    }

    /* ---------------- ALLERGY & DISLIKE ENFORCEMENT ---------------- */

    const ingredientText = extractIngredientsFromItem(item);

    const allergiesFound = allergyList.filter(a =>
      ingredientText.includes(a)
    );

    const dislikesFound = dislikedList.filter(d =>
      ingredientText.includes(d)
    );

    /* ---------------- ASSEMBLE FINAL TEXT ---------------- */

    const lines = [];

    if (issues.length > 0) {
      lines.push(`⚡ ATTENTION NEEDED - Prepare ${dishName}.`);
      lines.push(`Last order was ${issues.join(" and ")}.`);
      lines.push(`This time: ${fixes.join(", ")}.`);
    } else {
      lines.push(`Prepare ${dishName}.`);
    }

    // if (userPreferences.allergies && userPreferences.allergies.trim()) {
    //   lines.push(
    //     `⚠️ ALLERGEN ALERT: Do not use ${userPreferences.allergies}.`
    //   );
    // }


    // if (userPreferences.likes && userPreferences.likes.trim()) {
    //   lines.push(`Customer prefers: ${userPreferences.likes}.`);
    // }


    // if (likesText) {
    //   lines.push(`Customer prefers: ${likesText}.`);
    // }
// const preferenceLines = [];

// if (userPreferences.allergies && userPreferences.allergies.trim()) {
//   preferenceLines.push(
//     `⚠️ ALLERGEN ALERT: Do not use ${userPreferences.allergies}.`
//   );
// }

// if (userPreferences.dislikes && userPreferences.dislikes.trim()) {
//   preferenceLines.push(`Avoid: ${userPreferences.dislikes}.`);
// }

// if (userPreferences.likes && userPreferences.likes.trim()) {
//   preferenceLines.push(`Customer prefers: ${userPreferences.likes}.`);
// }

    descriptions.push(lines.join("\n"));

    metadata.push({
      itemId,
      dishName,
      hadIssues: issues.length > 0,
      issues,
    });
  }

 return {
  description: [
    descriptions.join("\n\n"),
    preferenceLines.join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n"),
  metadata,
  itemCount: orderItems.length,
};
}



/* ================== EXPORT ================== */

module.exports = {
  generateOrderDescription,
  aggregateFeedback,
  extractComplaintText,
};