require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_URL: process.env.DATABASE_URL,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESTAURANT_BUCKET_NAME: process.env.RESTAURANT_BUCKET_NAME,
  FLASH_ACCESS_TOKEN: process.env.FLASH_ACCESS_TOKEN,
  FLASH_STORE_ID: process.env.FLASH_STORE_ID,
  FLASH_BASE_URL: process.env.FLASH_BASE_URL || "https://open-api.flash.uengage.in"
};
