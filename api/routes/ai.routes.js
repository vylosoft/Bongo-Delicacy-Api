const router = require("express").Router();
const aiController = require("../controllers/ai.controller");

// POST /api/ai/recommend
router.post("/recommend", aiController.recommendDish);

// POST /api/ai/parse-menu
router.post("/parse-menu", aiController.parseMenu);

module.exports = router;
