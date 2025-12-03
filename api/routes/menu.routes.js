const express = require('express');
const router = express.Router();
const { fetchMenuCatagoryByResturent, fetchMenuByCatagory,fetchAdminMenuWithCategory } = require('../controllers/menu.controller');

// Route to fetch menus
router.get('/catagory-by-resturent', fetchMenuCatagoryByResturent);
router.post('/fetch-menus-by-catagory', fetchMenuByCatagory);
router.post('/fetch-admin-menus-with-catagory', fetchAdminMenuWithCategory);

module.exports = router;
