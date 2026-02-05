const { createClient } = require("@supabase/supabase-js");

// ⚠️ NOTE: Service role key must NEVER be exposed on frontend
const supabase = createClient(
  "https://nldgaczpzfmwamivniua.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY",
);

/**
 * Fetch user preferences and feedback history (USER-SCOPED)
 * @param {string} userId
 * @returns {Promise<{
 *  likes: string,
 *  dislikes: string,
 *  allergies: string,
 *  feedback: string[]
 * }>}
 */
const fetchUserPreferences = async (userId) => {
  try {
    const userPreferences = {
      likes: "",
      dislikes: "",
      allergies: "",
      feedback: [], // ✅ ARRAY, not string
    };

    /* ---------- 1. PROFILE PREFERENCES ---------- */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("dietary_preferences")
      .eq("id", userId)
      .single();

    if (!profileError && profile?.dietary_preferences) {
      userPreferences.likes = profile.dietary_preferences.likes || "";

      userPreferences.dislikes = profile.dietary_preferences.dislikes || "";

      userPreferences.allergies = profile.dietary_preferences.allergies || "";
    }

    /* ---------- 2. ORDER FEEDBACK (LAST 10) ---------- */
    const { data: orderFeedback, error: orderError } = await supabase
      .from("orders")
      .select("feedback")
      .eq("user_id", userId)
      .not("feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!orderError && Array.isArray(orderFeedback)) {
      userPreferences.feedback = orderFeedback
        .map((o) => o.feedback?.trim())
        .filter(Boolean);
    }

    return userPreferences;
  } catch (error) {
    console.error("Error fetching user preferences:", error);

    return {
      likes: "",
      dislikes: "",
      allergies: "",
      feedback: [],
    };
  }
};

module.exports = { fetchUserPreferences };
