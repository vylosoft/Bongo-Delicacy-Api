require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_URL: process.env.DATABASE_URL
};
