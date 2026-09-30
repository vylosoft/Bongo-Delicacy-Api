const supabase = require("../../config/db");

// Day index: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─────────────────────────────────────────────
// HELPER: Check if a time string (HH:MM) is valid
// ─────────────────────────────────────────────
const isValidTime = (t) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);

// ─────────────────────────────────────────────
// HELPER: Is outlet currently open based on timings?
// Returns { is_open, current_slot, next_open }
// ─────────────────────────────────────────────
const computeOpenStatus = (timings) => {
  const now = new Date();
  // IST offset: UTC+5:30
  const istOffset = 5 * 60 + 30;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + istOffset) % (24 * 60);
  const todayDay = new Date(now.getTime() + istOffset * 60000).getUTCDay(); // 0=Sun

  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const todayTimings = timings.filter(
    (t) => t.day_of_week === todayDay && !t.is_closed
  );

  // Check if currently open
  for (const slot of todayTimings) {
    const open = toMinutes(slot.open_time);
    let close = toMinutes(slot.close_time);

    // Handle overnight slots (e.g., 22:00 - 02:00)
    if (close < open) {
      // Spans midnight — treat close as next-day minutes
      if (istMinutes >= open || istMinutes < close) {
        return {
          is_open: true,
          current_slot: { open: slot.open_time, close: slot.close_time },
          next_open: null
        };
      }
    } else {
      if (istMinutes >= open && istMinutes < close) {
        return {
          is_open: true,
          current_slot: { open: slot.open_time, close: slot.close_time },
          next_open: null
        };
      }
    }
  }

  // Not open — find next opening (look ahead up to 7 days)
  for (let d = 0; d < 7; d++) {
    const checkDay = (todayDay + d) % 7;
    const daySlots = timings
      .filter((t) => t.day_of_week === checkDay && !t.is_closed)
      .sort((a, b) => toMinutes(a.open_time) - toMinutes(b.open_time));

    for (const slot of daySlots) {
      const open = toMinutes(slot.open_time);
      if (d > 0 || open > istMinutes) {
        return {
          is_open: false,
          current_slot: null,
          next_open: {
            day: DAY_NAMES[checkDay],
            time: slot.open_time
          }
        };
      }
    }
  }

  return { is_open: false, current_slot: null, next_open: null };
};

// ─────────────────────────────────────────────
// GET /outlets/:outlet_id/timings
// Returns all 7 days with their slots
// ─────────────────────────────────────────────
const getTimings = async (req, res) => {
  try {
    const { outlet_id } = req.params;

    const { data, error } = await supabase
      .from("outlet_timings")
      .select("*")
      .eq("outlet_id", outlet_id)
      .order("day_of_week", { ascending: true })
      .order("open_time", { ascending: true });

    if (error) {
      console.log(error);
      return res.error({ message: "Error fetching timings", status: 500 });
    }

    // Group by day, fill missing days as closed
    const grouped = DAY_NAMES.map((name, idx) => {
      const slots = data.filter((t) => t.day_of_week === idx);
      const isClosed = slots.length === 0 || slots.every((s) => s.is_closed);
      return {
        day_of_week: idx,
        day_name: name,
        is_closed: isClosed,
        slots: slots.map((s) => ({
          id: s.id,
          open_time: s.open_time,
          close_time: s.close_time,
          is_closed: s.is_closed
        }))
      };
    });

    const openStatus = computeOpenStatus(data);

    return res.success({
      data: {
        outlet_id,
        ...openStatus,
        schedule: grouped
      }
    });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ─────────────────────────────────────────────
// POST /outlets/:outlet_id/timings
// Save/replace timings for one or more days
// Body: { days: [{ day_of_week, is_closed, slots: [{open_time, close_time}] }] }
// ─────────────────────────────────────────────
const saveTimings = async (req, res) => {
  try {
    const { outlet_id } = req.params;
    const { days } = req.body;

    if (!Array.isArray(days) || days.length === 0) {
      return res.error({ message: "days array is required", status: 400 });
    }

    const errors = [];
    const rowsToUpsert = [];
    const dayIndexesToDelete = [];

    for (const day of days) {
      const { day_of_week, is_closed, slots } = day;

      if (day_of_week < 0 || day_of_week > 6) {
        errors.push(`Invalid day_of_week: ${day_of_week}`);
        continue;
      }

      dayIndexesToDelete.push(day_of_week);

      if (is_closed) {
        // Mark day as closed with a sentinel row
        rowsToUpsert.push({
          outlet_id,
          day_of_week,
          open_time: "00:00",
          close_time: "00:00",
          is_closed: true
        });
        continue;
      }

      if (!Array.isArray(slots) || slots.length === 0) {
        errors.push(`Day ${day_of_week} must have at least one slot when not closed`);
        continue;
      }

      for (const slot of slots) {
        const { open_time, close_time } = slot;

        if (!isValidTime(open_time) || !isValidTime(close_time)) {
          errors.push(`Day ${day_of_week}: invalid time format (use HH:MM)`);
          continue;
        }

        // Allow overnight (open > close) but not equal
        if (open_time === close_time) {
          errors.push(`Day ${day_of_week}: open and close time cannot be the same (${open_time})`);
          continue;
        }

        rowsToUpsert.push({
          outlet_id,
          day_of_week,
          open_time,
          close_time,
          is_closed: false
        });
      }
    }

    if (errors.length > 0) {
      return res.error({ message: errors.join("; "), status: 400 });
    }

    // Delete existing rows for the days being updated
    const { error: deleteError } = await supabase
      .from("outlet_timings")
      .delete()
      .eq("outlet_id", outlet_id)
      .in("day_of_week", dayIndexesToDelete);

    if (deleteError) {
      console.log(deleteError);
      return res.error({ message: "Failed to update timings", status: 500 });
    }

    // Insert new rows
    const { data, error: insertError } = await supabase
      .from("outlet_timings")
      .insert(rowsToUpsert)
      .select();

    if (insertError) {
      console.log(insertError);
      return res.error({ message: "Failed to save timings", status: 500 });
    }

    return res.success({ data, message: "Timings saved successfully" });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ─────────────────────────────────────────────
// PATCH /outlets/:outlet_id/timings/toggle-day
// Quickly toggle a full day closed/open
// Body: { day_of_week: 1, is_closed: true }
// ─────────────────────────────────────────────
const toggleDay = async (req, res) => {
  try {
    const { outlet_id } = req.params;
    const { day_of_week, is_closed } = req.body;

    if (day_of_week === undefined || typeof is_closed !== "boolean") {
      return res.error({ message: "day_of_week and is_closed (boolean) are required", status: 400 });
    }

    const { error } = await supabase
      .from("outlet_timings")
      .update({ is_closed })
      .eq("outlet_id", outlet_id)
      .eq("day_of_week", day_of_week);

    if (error) {
      console.log(error);
      return res.error({ message: "Failed to toggle day", status: 500 });
    }

    return res.success({
      message: `${DAY_NAMES[day_of_week]} marked as ${is_closed ? "closed" : "open"}`
    });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ─────────────────────────────────────────────
// POST /outlets/:outlet_id/timings/copy-to-all
// Copy one day's slots to all 7 days
// Body: { source_day: 1 }
// ─────────────────────────────────────────────
const copyToAllDays = async (req, res) => {
  try {
    const { outlet_id } = req.params;
    const { source_day } = req.body;

    if (source_day === undefined || source_day < 0 || source_day > 6) {
      return res.error({ message: "Valid source_day (0-6) is required", status: 400 });
    }

    // Fetch source day slots
    const { data: sourceSlots, error: fetchError } = await supabase
      .from("outlet_timings")
      .select("open_time, close_time, is_closed")
      .eq("outlet_id", outlet_id)
      .eq("day_of_week", source_day);

    if (fetchError || !sourceSlots?.length) {
      return res.error({ message: "Source day has no timings to copy", status: 400 });
    }

    // Delete all existing timings for this outlet
    const { error: deleteError } = await supabase
      .from("outlet_timings")
      .delete()
      .eq("outlet_id", outlet_id);

    if (deleteError) {
      console.log(deleteError);
      return res.error({ message: "Failed to clear existing timings", status: 500 });
    }

    // Insert source slots for all 7 days
    const newRows = [];
    for (let day = 0; day < 7; day++) {
      for (const slot of sourceSlots) {
        newRows.push({
          outlet_id,
          day_of_week: day,
          open_time: slot.open_time,
          close_time: slot.close_time,
          is_closed: slot.is_closed
        });
      }
    }

    const { data, error: insertError } = await supabase
      .from("outlet_timings")
      .insert(newRows)
      .select();

    if (insertError) {
      console.log(insertError);
      return res.error({ message: "Failed to copy timings", status: 500 });
    }

    return res.success({ data, message: `Timings from ${DAY_NAMES[source_day]} copied to all days` });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

// ─────────────────────────────────────────────
// GET /outlets/:outlet_id/timings/status
// Lightweight: is the outlet open right now?
// ─────────────────────────────────────────────
const getCurrentStatus = async (req, res) => {
  try {
    const { outlet_id } = req.params;

    const { data, error } = await supabase
      .from("outlet_timings")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("outlet_id", outlet_id);

    if (error) {
      console.log(error);
      return res.error({ message: "Error fetching timings", status: 500 });
    }

    const status = computeOpenStatus(data || []);
    return res.success({ data: { outlet_id, ...status } });
  } catch (err) {
    console.log(err);
    return res.error({ message: "Internal server error", status: 500 });
  }
};

module.exports = {
  getTimings,
  saveTimings,
  toggleDay,
  copyToAllDays,
  getCurrentStatus
};
