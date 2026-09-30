const express = require("express");
const cors = require("cors");
const routes = require("../api/routes");
const notFound = require("../middleware/notFound");
const errorHandler = require("../middleware/errorHandler");
const rateLimiter = require("../middleware/rateLimiter");

module.exports = ({ app }) => {
  app.use(cors());
  app.use(express.json({
    limit:"10mb"
  }));
  app.use(express.urlencoded({ extended: true }));

  app.use(require("../middleware/response"));


  app.use("/api", rateLimiter, routes);
  app.use(notFound);
  app.use(errorHandler);
};
