const express = require("express");
const expressLoader = require("./loaders/express");
const sequelizeLoader = require("./loaders/sequelize");
const sequelize = require("./config/db");

const app = express();

(async () => {
  try {
    await sequelizeLoader({ sequelize });
    expressLoader({ app });
    console.log("App initialized");
  } catch (err) {
    console.error("App init failed:", err);
    process.exit(1);
  }
})();

module.exports = app;
