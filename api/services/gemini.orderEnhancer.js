const { GoogleGenAI } = require("@google/genai");

/* ================== CLIENT SETUP ================== */

const { supabase } = require("../../utils/supabaseClient");

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
/**
 * Generate a single kitchen-readable instruction
 * for MULTIPLE dishes, joined with "and"
 */

/* ================== HELPERS ================== */

/**
 * Extract adjustments from feedback
 */
function deriveAdjustments(feedback) {
  const text = Array.isArray(feedback)
    ? feedback.join(" ").toLowerCase()
    : String(feedback || "").toLowerCase();

  return {
    spiceLimited:
      text.includes("too spicy") || text.includes("very spicy"),
    lessSalt: text.includes("too salty"),
    lessOil: text.includes("too oily") || text.includes("greasy"),
  };
}

/**
 * Resolve spice preference + feedback
 */
function resolveSpice(likes, spiceLimited) {
  const likesSpicy = String(likes || "").toLowerCase().includes("spicy");

  if (likesSpicy && spiceLimited) return "spicy but controlled";
  if (spiceLimited) return "medium spice level";
  if (likesSpicy) return "spicy";

  return null;
}

/**
 * Join dish names naturally using "and"
 */
function joinDishNames(orderItems = []) {
  const names = orderItems
    .map(i => i.name || i.itemname)
    .filter(Boolean)
    .map(n => n.toLowerCase());

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  return (
    names.slice(0, -1).join(", ") +
    " and " +
    names[names.length - 1]
  );
}

/* ================== MAIN FUNCTION ================== */

function generateOrderDescription(
  userPreferences,
  orderItems,
  restaurantName
) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return { description: "" };
  }

  const {
    allergies,
    dislikes,
    likes,
    feedback,
  } = userPreferences || {};

  const adjustments = deriveAdjustments(feedback);
  const spiceText = resolveSpice(likes, adjustments.spiceLimited);

  const dishText = joinDishNames(orderItems);

  const parts = [];

  // Opening
  parts.push(`Please prepare the ${dishText}`);

  // Spice handling
  if (spiceText) {
    parts.push(`with ${spiceText}`);
  }

  // Allergies (absolute)
  if (allergies) {
    parts.push(`do not use ${allergies}`);
  }

  // Dislikes
  if (dislikes) {
    parts.push(`do not use ${dislikes}`);
  }

  // Other adjustments
  if (adjustments.lessSalt) {
    parts.push("use less salt");
  }

  if (adjustments.lessOil) {
    parts.push("use less oil");
  }

  // Final sentence formatting
  const description =
    parts
      .join(", ")
      .replace(/, do not/g, ". Do not")
      .replace(/, use/g, ". Use") + ".";

  return { description };
}

/* ================== EXPORT ================== */

module.exports = { generateOrderDescription };

