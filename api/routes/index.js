const router = require('express').Router();

router.use('/menu', require('./menu.routes'));
router.use('/resturents', require('./resturents.route'));
router.use('/payment', require('./payment.routes')); // now works after fixing payment.routes.js

module.exports = router;

