const express = require('express');
const router = express.Router();
const {
  fetchMenuCatagoryByResturent,
  fetchMenuByCatagory,
  fetchAdminMenuWithCategory,
  updateMenuItemTags,
  fetchMenuByQuizTags,
} = require('../controllers/menu.controller');
const {
 fetchQuizResults
} = require('../controllers/quizResults.controller');
const { syncMenuController } = require('../controllers/menuSync.controller');

// Route to fetch menus
router.get('/catagory-by-resturent', fetchMenuCatagoryByResturent);
router.post('/fetch-menus-by-catagory', fetchMenuByCatagory);
router.post('/fetch-admin-menus-with-catagory', fetchAdminMenuWithCategory);

// Food Finder quiz tags (admin set, frontend filter)
router.patch('/item-tags', updateMenuItemTags);
router.post('/fetch-menus-by-quiz-tags', fetchMenuByQuizTags);
router.post("/quiz-results",fetchQuizResults);
router.post('/menu-sync', syncMenuController);
module.exports = router;