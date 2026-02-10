
const supabase = require("../../config/db");

export const insertRestaurant = (payload) =>
  supabase.from('restaurants').insert([payload]).select();

export const insertTable = (payload) =>
  supabase.from('restaurant_tables').insert([payload]).select();
