const router = require("express").Router();
const { itemStockWebhook } = require("../controllers/webhooks/stockWebhook.controller");

router.post("/item-stock", itemStockWebhook);

module.exports = router;
