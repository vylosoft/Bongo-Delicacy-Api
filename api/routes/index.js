const router = require('express').Router();
router.use('/menu', require('./menu.routes'));
module.exports = router;
