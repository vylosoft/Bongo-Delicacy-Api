const express = require("express");
const router = express.Router();
const multer = require("multer");

// multer memory storage (so we can upload buffer to Supabase)

const outletController = require("../controllers/outlet.controller");

router.get("/", outletController.getAll);

router.get("/:uuid", outletController.getDetails);


module.exports = router;
