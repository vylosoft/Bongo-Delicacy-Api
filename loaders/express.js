const express = require("express");
const cors = require("cors");
const routes = require("../api/routes");
const notFound = require("../middleware/notFound");
const errorHandler = require("../middleware/errorHandler");

module.exports = ({ app }) => {
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(require("../middleware/response"));
  app.use("/api", routes);

  // -----------------------------
  // PetPooja Webhooks (no /api)
  // -----------------------------
  app.post("/webhooks/petpooja/item-off", (req, res) => {
    console.log("PetPooja ITEM OFF:", req.body);
    return res.status(200).json({ ok: true });
  });

  app.post("/webhooks/petpooja/item-on", (req, res) => {
    console.log("PetPooja ITEM ON:", req.body);
    return res.status(200).json({ ok: true });
  });

  app.post("/webhooks/petpooja/store-update", (req, res) => {
    console.log("PetPooja STORE UPDATE:", req.body);
    return res.status(200).json({ ok: true });
  });

  app.post("/webhooks/petpooja/store-status", (req, res) => {
    console.log("PetPooja STORE STATUS:", req.body);
    return res.status(200).json({ ok: true, is_open: true });
  });
  app.post("/webhooks/petpooja/push-menu", (req, res) => {
    console.log("PetPooja STORE STATUS:", req.body);
    return res.status(200).json({ ok: true, is_open: true });
  });
  app.use(notFound);
  app.use(errorHandler);
};
