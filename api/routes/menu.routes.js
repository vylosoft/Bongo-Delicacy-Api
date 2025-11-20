const express = require('express');
const router = express.Router();
const { fetchMenuCatagoryByResturent, fetchMenuByCatagory } = require('../controllers/menu.controller');

// Route to fetch menus
router.get('/catagory-by-resturent', fetchMenuCatagoryByResturent);
router.post('/fetch-menus-by-catagory', fetchMenuByCatagory);


module.exports = router;
