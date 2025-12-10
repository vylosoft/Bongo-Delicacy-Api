// controllers/reservation.controller.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------- CREATE RESERVATION -------------------
const createReservation = async (req, res) => {
  try {
    const { rest_id } = req.params;  // Brand / Restaurant id
    const { name, phone, email, date, time, guests, tableId, user_id } = req.body;

    if (!rest_id || !name || !phone || !date || !time || !tableId) {
      return res.status(400).json({
        error: "rest_id, name, phone, date, time, and tableId are required"
      });
    }

    // PREVENT DOUBLE BOOKING
    const { data: existing } = await supabase
      .from("reservations")
      .select("id")
      .eq("brand_id", rest_id)       // FIXED
      .eq("table_id", tableId)
      .eq("date", date)
      .eq("time", time)
      .eq("status", "confirmed");

    if (existing?.length > 0) {
      return res.status(409).json({ error: "Table is already booked for this slot" });
    }

    // GENERATE BOOKING ID
    const formattedDate = date.replace(/-/g, "");
    const { count } = await supabase
      .from("reservations")
      .select("id", { head: true, count: "exact" })
      .eq("date", date);

    const booking_id = `R-${formattedDate}-${String(count + 1).padStart(2, "0")}`;

    // INSERT RESERVATION
    const payload = {
      brand_id: rest_id,   // FIXED COLUMN
      user_id: user_id || null,
      name,
      phone,
      email,
      date,
      time,
      guests,
      table_id: tableId,
      status: "confirmed",
      booking_id
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(payload)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // MARK TABLE AS BOOKED
    await supabase
      .from("restaurant_tables")
      .update({ is_booked: true })
      .eq("id", tableId);

    return res.status(201).json({
      message: "Reservation confirmed",
      booking_id,
      reservation: data
    });

  } catch (err) {
    console.error("createReservation:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ------------------- GET AVAILABLE TABLES -------------------
const getAvailableTables = async (req, res) => {
  try {
    const { rest_id } = req.params;
    const { date, time } = req.query;

    if (!rest_id) return res.status(400).json({ error: "rest_id required" });

    // 1) GET ALL ACTIVE TABLES
    const { data: tables, error: tableErr } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("rest_id", rest_id)
      .eq("is_active", true);

    if (tableErr) throw tableErr;

    // If date or time missing → return everything
    if (!date || !time) {
      return res.json({
        booked: [],
        available: tables
      });
    }

    // 2) GET TABLES ALREADY RESERVED
    const { data: reservations, error: resErr } = await supabase
      .from("reservations")
      .select("table_id")
      .eq("brand_id", rest_id)
      .eq("date", date)
      .eq("time", time)
      .eq("status", "confirmed");

    if (resErr) throw resErr;

    const bookedIds = reservations.map(r => r.table_id);

    // 3) SPLIT TABLES INTO TWO LISTS
    const booked = tables.filter(t => bookedIds.includes(t.id) || t.is_booked === true);
    const available = tables.filter(t => !bookedIds.includes(t.id) && t.is_booked === false);

    return res.json({ booked, available });

  } catch (err) {
    console.error("getAvailableTables:", err);
    res.status(500).json({ error: "Failed to fetch tables" });
  }
};


module.exports = { createReservation, getAvailableTables };
