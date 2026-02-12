const { generateOrderId } = require("../../utils/reservationOrderId");
const supabase = require("../../config/db");

/* =========================================================
   CREATE RESERVATION
========================================================= */
const getAvailableTables = async (req, res) => {
  try {
    const { rest_id } = req.params;
    const { date, time, guests } = req.query;

    const outletId = rest_id;

    if (!outletId || !date || !time || !guests) {
      return res.status(400).json({
        error: "Missing required parameters",
      });
    }

    /* 1️⃣ Calculate 2-hour window */
    const startTime = time;

    const addHours = (time, hours) => {
      const [h, m] = time.split(":").map(Number);
      const d = new Date();
      d.setHours(h + hours, m, 0, 0);
      return d.toTimeString().slice(0, 5);
    };

    const endTime = addHours(startTime, 2);

    /* 2️⃣ Fetch active tables */
    const { data: tables, error: tableErr } = await supabase
      .from("outlet_tables")
      .select("id, table_number, capacity, is_active")
      .eq("outlet_id", outletId)
      .eq("is_active", true);

    if (tableErr) throw tableErr;

    /* 3️⃣ Fetch overlapping reservations */
    const { data: conflicts, error: conflictErr } = await supabase
      .from("reservations")
      .select("table_id")
      .eq("outlet_id", outletId)
      .eq("date", date)
      .in("status", ["confirmed", "extended"])
      .lt("time", endTime)
      .gt("end_time", startTime);

    if (conflictErr) throw conflictErr;

    const bookedTableIds = new Set(
      (conflicts || []).map((r) => r.table_id)
    );

    /* 4️⃣ Build response */
    const result = tables.map((table) => {
      if (bookedTableIds.has(table.id)) {
        return { ...table, _status: "booked" };
      }

      if (table.capacity < Number(guests)) {
        return { ...table, _status: "too_small" };
      }

      return { ...table, _status: "available" };
    });

    return res.json(result);

  } catch (err) {
    console.error("getAvailableTables:", err);
    return res.status(500).json({
      error: "Failed to fetch tables",
    });
  }
};

const createReservation = async (req, res) => {
  try {
    const { rest_id } = req.params;
    const { name, phone, email, date, time, guests, tableId, user_id } =
      req.body;

    if (!rest_id || !name || !phone || !date || !time || !tableId) {
      return res.status(400).json({
        error: "rest_id, name, phone, date, time, tableId are required",
      });
    }

    // ✅ Fetch table_number from the database
    const { data: tableData, error: tableError } = await supabase
      .from("outlet_tables")
      .select("table_number")
      .eq("id", tableId)
      .single();

    if (tableError || !tableData) {
      return res.status(404).json({
        error: "Table not found",
      });
    }

    const [hour, minute] = time.split(":").map(Number);
    const end_time = `${String(hour + 2).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    // 🔥 Only same table conflict
    const { data: existing } = await supabase
      .from("reservations")
      .select("id")
      .eq("outlet_id", rest_id)
      .eq("table_id", tableId)
      .eq("date", date)
      .in("status", ["confirmed", "extended"])
      .lt("time", end_time)
      .gt("end_time", time);

    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "This table is already booked for this time slot",
      });
    }

    const booking_id = generateOrderId();

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        brand_id: rest_id,
        outlet_id: rest_id,
        table_number: tableData.table_number,  // ✅ Now defined
        user_id: user_id || null,
        name,
        phone,
        email,
        date,
        time,
        end_time,
        guests,
        table_id: tableId,
        status: "confirmed",
        booking_id,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(201).json({
      message: "Reservation confirmed",
      booking_id,
      reservation: data,
    });
  } catch (err) {
    console.error("createReservation:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
const getAllReservations = async (req, res) => {
  try {
    const { rest_id } = req.params;
    const { status, date, user_id, table_id } = req.query;

    let query = supabase
      .from("reservations")
      .select("*")
      .eq("outlet_id", rest_id)
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    // Optional filters
    if (status) {
      query = query.eq("status", status);
    }
    if (date) {
      query = query.eq("date", date);
    }
    if (user_id) {
      query = query.eq("user_id", user_id);
    }
    if (table_id) {
      query = query.eq("table_id", table_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      count: data.length,
      reservations: data,
    });
  } catch (err) {
    console.error("getAllReservations:", err);
    return res.status(500).json({ error: "Failed to fetch reservations" });
  }
};

// ✅ Update reservation status
const updateReservationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["pending", "confirmed", "extended", "cancelled", "completed", "no_show"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updateData = { status };

    // Add timestamp for cancelled status
    if (status === "cancelled") {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancelled_by = req.body.cancelled_by || "admin";
    }

    const { data, error } = await supabase
      .from("reservations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    return res.json({
      success: true,
      message: `Reservation status updated to ${status}`,
      reservation: data,
    });
  } catch (err) {
    console.error("updateReservationStatus:", err);
    return res.status(500).json({ error: "Failed to update reservation status" });
  }
};

// ✅ Admin confirm
const adminConfirmReservation = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data)
    return res.status(400).json({ error: "Could not confirm reservation" });
  return res.json({ success: true, reservation: data });
};

// ✅ Admin/User cancel
const cancelReservation = async (req, res) => {
  const { id } = req.params;
  const { cancelled_by = "admin" } = req.body;

  const { data, error } = await supabase
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by,
    })
    .eq("id", id)
    .in("status", ["pending", "confirmed", "extended"])
    .select()
    .single();

  if (error || !data)
    return res.status(400).json({ error: "Could not cancel reservation" });
  return res.json({ success: true, reservation: data });
};

// ✅ Extend reservation (if table still free)
const extendReservation = async (req, res) => {
  const { id } = req.params;
  const { extra_hours = 1 } = req.body;

  // Get current reservation
  const { data: res_data, error: fetchErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !res_data)
    return res.status(404).json({ error: "Reservation not found" });
  if (!["confirmed", "extended"].includes(res_data.status)) {
    return res
      .status(400)
      .json({ error: "Only confirmed reservations can be extended" });
  }

  const currentEnd = res_data.end_time || res_data.time;
  const [eh, em] = currentEnd.split(":").map(Number);
  const new_end_time = `${String(eh + extra_hours).padStart(2, "0")}:${String(em).padStart(2, "0")}`;

  // Check if table is free for the extended slot
  const { data: conflict } = await supabase
    .from("reservations")
    .select("id")
    .eq("brand_id", res_data.brand_id)
    .eq("table_id", res_data.table_id)
    .eq("date", res_data.date)
    .in("status", ["confirmed", "extended"])
    .neq("id", id) // exclude current reservation
    .lt("time", new_end_time)
    .gt("end_time", currentEnd);

  if (conflict && conflict.length > 0) {
    return res.status(409).json({ error: "Table not available for extension" });
  }

  const { data, error } = await supabase
    .from("reservations")
    .update({ end_time: new_end_time, status: "extended" })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ success: true, new_end_time, reservation: data });
};

module.exports = {
  createReservation,
  getAvailableTables,
  getAllReservations,
  updateReservationStatus,
  adminConfirmReservation,
  cancelReservation,
  extendReservation,

};
