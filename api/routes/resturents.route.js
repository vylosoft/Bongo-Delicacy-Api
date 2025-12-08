const express = require('express');
const router = express.Router();

const {
    fetchResturentByMappingId,
    addResturent,
    addResturentTable
} = require('../controllers/returents.controller');

// fetch restaurant using mappingId
router.get('/restaurant-by-mappingId', fetchResturentByMappingId);
router.post('/add', addResturent);
router.post('/:rest_id/addTable', addResturentTable);
module.exports = router;
