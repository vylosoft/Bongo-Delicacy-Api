const Joi = require('joi');
const { fetchResturentByMappingIdSchema, addResturentSchema, addResturentTableSchema } = require('../validations/resturent.validation');
const { petpujaService } = require('../../utils/petpujaService');
const { createClient } = require('@supabase/supabase-js');
// const supabase = require("../../config/db");
const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_IMAGE = "https://via.placeholder.com/400x300?text=No+Image";

const fetchResturentByMappingId = async (req, res) => {
  try {
    const reqBody = { ...req.query };
    const validateSchema = fetchResturentByMappingIdSchema(reqBody);
    if (validateSchema.error) {
      return res.error({
        message: validateSchema.error.details.map(e => e.message).join(', '),
        status: 400,
      });
    }

    const { resturent_identifier } = validateSchema.value;

    const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const responseData = await petpujaService(URI, { restID: resturent_identifier });

    return res.success({ data: responseData.restaurants });
  } catch (err) {
    return res.error({ message: 'Internal server error' });
  }
};


const addResturent = async (req, res) => {
  try {
    const { error } = addResturentSchema(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const {
      rest_id,
      name,
      tagline,
      description,
      logo,
      hero_image,
      about_text,
      about_image,
      theme_primary,
      theme_accent,
      theme_text_on_primary,
      Latitude,
      Longitude,
    } = req.body;

    const petpujaUrl = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
    const petRes = await petpujaService(petpujaUrl, { restID: rest_id });

    if (!petRes?.restaurants?.length) {
      return res.status(404).json({ error: "Restaurant not found in PetPuja" });
    }

    const payload = {
      rest_id,
      name,
      tagline,
      description,
      logo,
      hero_image,
      about_text,
      about_image,
      theme_primary,
      theme_accent,
      theme_text_on_primary,
      Latitude,
      Longitude,
    };

    const { data, error: dbError } = await supabase
      .from("restaurants")
      .insert([payload])
      .select()
      .single();

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({
      message: "Restaurant created successfully",
      restaurant: data,
    });
  } catch (err) {
    console.error("addResturent:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


const addResturentTable = async (req, res) => {
  try {
    const rest_id = req.params.rest_id;
    if (!rest_id) return res.status(400).json({ error: "rest_id is required" });

    const { value, error } = addResturentTableSchema(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const requestedNumber = Number(value.table_number);
    const capacity = Number(value.capacity);

    // Fetch existing highest table number for this restaurant
    const { data: existing } = await supabase
      .from("restaurant_tables")
      .select("table_number")
      .eq("rest_id", rest_id)
      .order("table_number", { ascending: false })
      .limit(1);

    let finalTableNumber = requestedNumber;

    // If requested number exists or lower, increment
    if (existing && existing.length > 0 && existing[0].table_number >= requestedNumber) {
      finalTableNumber = existing[0].table_number + 1;
    }

    const table_name = `Table ${finalTableNumber}`;

    const payload = {
      rest_id,
      table_number: finalTableNumber,
      capacity,
      table_name,
      is_active: true,
    };

    const { data, error: dbError } = await supabase
      .from("restaurant_tables")
      .insert([payload])
      .select();

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({
      message: "Table added successfully",
      table: data[0],
    });

  } catch (err) {
    console.error("addResturentTable:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getTablesByRestaurant = async (req, res) => {
  try {
    const { rest_id } = req.params;
    if (!rest_id) return res.status(400).json({ error: "rest_id is required" });

    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("rest_id", rest_id)
      .order("table_number", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ tables: data });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
const toggleTableStatus = async (req, res) => {
  try {
    const { table_id } = req.params;
    const { is_active } = req.body;

    const { data, error } = await supabase
      .from("restaurant_tables")
      .update({ is_active })
      .eq("id", table_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({
      message: "Table status updated",
      table: data,
    });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { fetchResturentByMappingId, addResturent, addResturentTable, getTablesByRestaurant, toggleTableStatus };