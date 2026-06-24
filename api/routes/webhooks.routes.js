const router = require("express").Router();
const { itemStockWebhook } = require("../controllers/webhooks/stockWebhook.controller");
const petpoojaMenuController = require("../controllers/webhooks/petpoojaMenu.controller");

const {
  handlePetPoojaStoreWebhook,getStoreStatus
} = require("../controllers/webhooks/petpoojaStore.controller");
const { getAllMenuWebhookLogs } = require("../controllers/getWebhookLogs.controller");

router.get("/menu-webhook-logs", getAllMenuWebhookLogs);
router.post("/store-update", handlePetPoojaStoreWebhook);
router.post("/store-status", getStoreStatus);

router.post("/push-menu", petpoojaMenuController.pushMenuWebhook);
router.get("/cached-menu", petpoojaMenuController.getCachedMenu);
router.post("/item-stock", itemStockWebhook);

module.exports = router;
 