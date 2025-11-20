const express = require('express');
const expressLoader = require('./loaders/express');
const sequelizeLoader = require('./loaders/sequelize');
const sequelize = require('./config/db');

const app = express();

(async () => {
  await sequelizeLoader({ sequelize });
  expressLoader({ app });
})();

module.exports = app;
