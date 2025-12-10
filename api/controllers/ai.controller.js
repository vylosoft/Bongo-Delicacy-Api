const { getMealRecommendation, parseMenuFromText } = require("../services/gemini.service");

const recommendDish = async (req, res) => {
  try {
    const { preferences, menu, brandName } = req.body;
    const recommendation = await getMealRecommendation(preferences, menu, brandName);
    res.json({ recommendation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const parseMenu = async (req, res) => {
  try {
    const { text } = req.body;
    const result = await parseMenuFromText(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  recommendDish,
  parseMenu,
};
