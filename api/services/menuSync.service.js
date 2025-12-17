
const { petpujaService } = require('../../utils/petpujaService');
const { createClient } = require('@supabase/supabase-js');
// const supabase = require("../../config/db");
const SUPABASE_URL = 'https://nldgaczpzfmwamivniua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const syncRestaurantMenu = async (restaurantIdentifier) => {
  // 1. Fetch restaurant UUID
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('resturent_identifier', restaurantIdentifier)
    .single();

  if (restError || !restaurant) {
    throw new Error('Restaurant not found in restaurants table');
  }

  const restaurantId = restaurant.id;

  // 2. Fetch menu from PetPuja
  const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
  const response = await petpujaService(URI, { restID: restaurantIdentifier });

  const categories = response.categories || [];
  const items = response.items || [];

  // 3. Insert categories
  const categoryPayload = categories.map(c => ({
    restaurant_id: restaurantId,
    category_id: c.categoryid,
    name: c.categoryname,
    active: c.active === '1'
  }));

  if (categoryPayload.length > 0) {
    const { error } = await supabase
      .from('menu_categories')
      .upsert(categoryPayload, {
        onConflict: 'restaurant_id,category_id',
        ignoreDuplicates: true
      });

    if (error) throw error;
  }

  // 4. Insert items
  const itemPayload = items.map(i => ({
    restaurant_id: restaurantId,
    item_id: i.itemid,
    category_id: i.item_categoryid,
    name: i.itemname,
    description: i.itemdescription || null,
    price: Number(i.price || 0),
    active: i.active === '1',
    image_url: i.item_image_url || null
  }));

  if (itemPayload.length > 0) {
    const { error } = await supabase
      .from('menu_items')
      .upsert(itemPayload, {
        onConflict: 'restaurant_id,item_id',
        ignoreDuplicates: true
      });

    if (error) throw error;
  }

  return {
    restaurant_identifier: restaurantIdentifier,
    categories_synced: categoryPayload.length,
    items_synced: itemPayload.length
  };
};

module.exports = { syncRestaurantMenu };


