const express = require('express');
const router = express.Router();

const {
    fetchResturentByMappingId
} = require('../controllers/returents.controller');

// fetch restaurant using mappingId
router.get('/restaurant-by-mappingId', fetchResturentByMappingId);

module.exports = router;
