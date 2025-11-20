const { Sequelize } = require('sequelize');
const env = require('./env');

const sequelize = new Sequelize(env.DB_URL, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 2,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;
