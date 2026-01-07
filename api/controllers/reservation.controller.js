const { createClient } = require("@supabase/supabase-js");
 const { generateOrderId } = require("../../utils/reservationOrderId");
const SUPABASE_URL = "https://nldgaczpzfmwamivniua.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================================================
   CREATE RESERVATION
========================================================= */
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

    /* ---------- DOUBLE BOOKING CHECK ---------- */
    const { data: existing } = await supabase
      .from("reservations")
      .select("id")
      .eq("brand_id", rest_id)
      .eq("table_id", tableId)
      .eq("date", date)
      .eq("time", time)
      .eq("status", "confirmed");

    if (existing && existing.length > 0) {
      return res
        .status(409)
        .json({ error: "Table already booked for this slot" });
    }

    /* ---------- GENERATE BOOKING ID ---------- */
   const booking_id = generateOrderId();


    /* ---------- INSERT RESERVATION ---------- */
    const payload = {
      brand_id: rest_id,
      user_id: user_id || null,
      name,
      phone,
      email,
      date,
      time,
      guests,
      table_id: tableId,
      status: "confirmed",
      booking_id,
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

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

/* =========================================================
   GET AVAILABLE TABLES (DATE + TIME + CAPACITY BASED)
========================================================= */
const getAvailableTables = async (req, res) => {
  try {
    const { rest_id } = req.params;
    const { date, time, guests } = req.query;

    if (!rest_id || !date || !time) {
      return res
        .status(400)
        .json({ error: "rest_id, date and time are required" });
    }

    /* ---------- 1. FETCH ALL VALID TABLES ---------- */
    const { data: tables, error: tableErr } = await supabase
      .from("restaurant_tables")
      .select("id, table_name, capacity")
      .eq("rest_id", rest_id)
      .eq("is_active", true)
      .gte("capacity", Number(guests || 1));

    if (tableErr) throw tableErr;

    /* ---------- 2. FETCH BOOKED TABLES FOR SLOT ---------- */
    const { data: reservations, error: resErr } = await supabase
      .from("reservations")
      .select("table_id")
      .eq("brand_id", rest_id)
      .eq("date", date)
      .eq("time", time)
      .eq("status", "confirmed");

    if (resErr) throw resErr;

    const bookedIds = new Set(reservations.map((r) => r.table_id));

    /* ---------- 3. ATTACH STATUS ---------- */
    const result = tables.map((t) => ({
      id: t.id,
      name: t.table_name,
      capacity: t.capacity,
      _status: bookedIds.has(t.id) ? "booked" : "available",
    }));

    return res.json(result);
  } catch (err) {
    console.error("getAvailableTables:", err);
    return res.status(500).json({ error: "Failed to fetch tables" });
  }
};

module.exports = {
  createReservation,
  getAvailableTables,
};
