const router = require("express").Router();
const aiController = require("../controllers/ai.controller");
const { helpBuddyChat } = require("../controllers/helpBuddy.controller");
// POST /api/ai/recommend
router.post("/recommend", aiController.recommendDish);

// POST /api/ai/parse-menu
router.post("/parse-menu", aiController.parseMenu);
router.post("/user-recommendations", aiController.getUserRecommendations);


router.post("/help-buddy/chat", helpBuddyChat);
module.exports = router;
