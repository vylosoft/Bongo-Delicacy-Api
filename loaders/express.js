const express = require('express');
const routes = require('../api/routes');
const notFound = require('../middleware/notFound');
const errorHandler = require('../middleware/errorHandler');

module.exports = ({ app }) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
};
