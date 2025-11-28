require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_URL: process.env.DATABASE_URL,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
};
