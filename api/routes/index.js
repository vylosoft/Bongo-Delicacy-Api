const router = require('express').Router();
router.use('/menu', require('./menu.routes'));
router.use('/resturents', require('./resturents.route'));
module.exports = router;
