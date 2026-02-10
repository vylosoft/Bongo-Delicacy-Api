const supabase = require("../../config/db");

/* ================== USER PREFERENCES ================== */

const fetchUserPreferences = async (userId) => {
  try {
    const defaultPrefs = {
      likes: "",
      dislikes: "",
      allergies: "",
    };

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("dietary_preferences")
      .eq("id", userId)
      .single();

    if (error || !profile?.dietary_preferences) {
      console.log("[USER_PREFS] No preferences found");
      return defaultPrefs;
    }

    const dp = profile.dietary_preferences;

    return {
      likes: Array.isArray(dp.likes) ? dp.likes.join(", ") : dp.likes || "",
      dislikes: Array.isArray(dp.dislikes)
        ? dp.dislikes.join(", ")
        : dp.dislikes || "",
      allergies: Array.isArray(dp.allergies)
        ? dp.allergies.join(", ")
        : dp.allergies || "",
    };
  } catch (err) {
    console.error("[USER_PREFS] Error:", err);
    return {
      likes: "",
      dislikes: "",
      allergies: "",
    };
  }
};

/* ================== HELPER FUNCTIONS ================== */

function normalizeItemId(item) {
  return String(item.itemid || item.id || "").trim();
}

function normalizeItemName(item) {
  const name = item.name || item.itemname || "";
  return name.toLowerCase().trim();
}

/**
 * Extract complaint data including itemNames
 */
function extractComplaintData(complaint) {
  if (!complaint) return { text: "", itemNames: [] };

  try {
    let parsed = complaint;

    if (typeof complaint === "string") {
      try {
        parsed = JSON.parse(complaint);
      } catch {
        return { text: complaint.trim(), itemNames: [] };
      }
    }

    if (typeof parsed === "object" && parsed !== null) {
      const textFields = [
        parsed.comments,
        parsed.comment,
        parsed.message,
        parsed.description,
        parsed.reason,
        parsed.issue,
        parsed.feedback,
        parsed.text,
      ];

      let text = "";
      for (const field of textFields) {
        if (field && typeof field === "string" && field.trim()) {
          text = field.trim();
          break;
        }
      }

      let itemNames = [];
      if (Array.isArray(parsed.itemNames)) {
        itemNames = parsed.itemNames
          .filter((name) => name && typeof name === "string")
          .map((name) => name.toLowerCase().trim());
      } else if (Array.isArray(parsed.items)) {
        itemNames = parsed.items
          .filter((name) => name && typeof name === "string")
          .map((name) => name.toLowerCase().trim());
      }

      return {
        text: text || JSON.stringify(parsed),
        itemNames,
      };
    }

    return { text: String(complaint).trim(), itemNames: [] };
  } catch (error) {
    console.error("[COMPLAINT] Extraction failed:", error);
    return { text: String(complaint || "").trim(), itemNames: [] };
  }
}

/* ================== FEEDBACK FETCHING ================== */

const fetchRelevantOrderFeedback = async (supabase, userId, currentItems) => {
  const currentItemIds = new Set(
    currentItems.map(normalizeItemId).filter(Boolean),
  );

  const currentItemNames = new Set(
    currentItems.map(normalizeItemName).filter(Boolean),
  );

  if (currentItemIds.size === 0 && currentItemNames.size === 0) {
    console.log("[FETCH] No valid items to match");
    return [];
  }

  console.log("[FETCH] Looking for items:", {
    ids: Array.from(currentItemIds),
    names: Array.from(currentItemNames),
  });

  const { data: orders, error } = await supabase
    .from("orders")
    .select("items, feedback, rating, complaint, created_at")
    .eq("user_id", userId)
    .eq("status", "DELIVERED")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !orders) {
    console.error("[FETCH] Error fetching orders:", error);
    return [];
  }

  console.log(`[FETCH] Found ${orders.length} past delivered orders`);

  const itemFeedbackMap = new Map();

  for (const order of orders) {
    let pastItems = [];

    try {
      if (Array.isArray(order.items)) {
        // Already an array
        pastItems = order.items;
      } else if (typeof order.items === "string") {
        // JSON string
        pastItems = JSON.parse(order.items);
      } else if (typeof order.items === "object" && order.items !== null) {
        // JSONB object (Supabase)
        pastItems = order.items;
      } else {
        pastItems = [];
      }
    } catch (parseError) {
      console.error("[FETCH] Failed to normalize items:", {
        items: order.items,
        error: parseError,
      });
      continue;
    }

    let complaintItemNames = [];
    if (order.complaint) {
      const complaintData = extractComplaintData(order.complaint);
      complaintItemNames = complaintData.itemNames;
    }

    for (const pastItem of pastItems) {
      const pastItemId = normalizeItemId(pastItem);
      const pastItemName = normalizeItemName(pastItem);

      const matchesById = pastItemId && currentItemIds.has(pastItemId);
      const matchesByName = pastItemName && currentItemNames.has(pastItemName);
      const mentionedInComplaint = complaintItemNames.includes(pastItemName);

      if (!matchesById && !matchesByName && !mentionedInComplaint) {
        continue;
      }

      const hasNegativeFeedback =
        (order.rating != null && order.rating <= 3) ||
        (order.feedback && order.feedback.trim().length > 0) ||
        order.complaint;

      if (!hasNegativeFeedback) {
        continue;
      }

      const key = pastItemId || pastItemName;

      if (!itemFeedbackMap.has(key)) {
        itemFeedbackMap.set(key, []);
      }

      itemFeedbackMap.get(key).push({
        itemId: pastItemId,
        itemName: pastItem.name || pastItem.itemname,
        feedback: order.feedback || "",
        complaint: order.complaint,
        rating: order.rating,
        orderDate: order.created_at,
        matchedBy: matchesById
          ? "id"
          : matchesByName
            ? "name"
            : "complaint_mention",
      });

      console.log(
        `[FETCH] Matched: ${pastItem.name || pastItem.itemname} (by ${
          matchesById ? "id" : matchesByName ? "name" : "complaint_mention"
        })`,
      );
    }
  }

  const result = [];
  for (const [key, feedbackList] of itemFeedbackMap.entries()) {
    result.push(...feedbackList);
  }

  console.log(`[FETCH] Returning ${result.length} relevant feedback entries`);

  return result;
};

/* ================== EXPORTS ================== */

module.exports = {
  fetchUserPreferences,
  fetchRelevantOrderFeedback,
  extractComplaintData,
  supabase,
};
