const express = require('express');
const cors = require('cors')
const routes = require('../api/routes');
const notFound = require('../middleware/notFound');
const errorHandler = require('../middleware/errorHandler');

 // 👈 LOADS .env
module.exports = ({ app }) => {
  app.use(cors())
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(require('../middleware/response'));
  app.use('/api', routes);


 
  app.use(notFound);
  app.use(errorHandler);
};
