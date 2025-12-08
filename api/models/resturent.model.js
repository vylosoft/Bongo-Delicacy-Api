import { createClient } from '@supabase/supabase-js';
import env from '../../config/env.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export const insertRestaurant = (payload) =>
  supabase.from('restaurants').insert([payload]).select();

export const insertTable = (payload) =>
  supabase.from('restaurant_tables').insert([payload]).select();
