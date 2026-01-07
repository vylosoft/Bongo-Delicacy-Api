const router = require('express').Router();
const { processComplaintRefund } = require('../controllers/complaintRefund.controller');
router.post('/refund', processComplaintRefund);


module.exports = router;