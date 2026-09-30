const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Orders = sequelize.define('Orders', {}, {
  tableName: 'orders',
  timestamps: false,
});

module.exports = Orders;