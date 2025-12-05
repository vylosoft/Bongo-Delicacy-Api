const router = require('express').Router();
router.use('/complaints', require('./complaint.routes'));

module.exports = router;