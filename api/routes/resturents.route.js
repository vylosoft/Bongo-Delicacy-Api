const express = require('express');
const router = express.Router();

const {
  fetchResturentByMappingId,
  addResturent,
  addResturentTable,
  getTablesByRestaurant,
  toggleTableStatus
} = require('../controllers/returents.controller');

// Fetch restaurant using mappingId
router.get('/restaurant-by-mappingId', fetchResturentByMappingId);

// Add restaurant
router.post('/add', addResturent);

// Add table
router.post('/:rest_id/addTable', addResturentTable);

// Get tables
router.get('/:rest_id/tables', getTablesByRestaurant);

// Toggle table active/inactive
router.patch('/table/:table_id/toggleStatus', toggleTableStatus);


module.exports = router;
