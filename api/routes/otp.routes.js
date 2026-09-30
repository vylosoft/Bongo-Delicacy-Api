const express = require('express');
const router = express.Router();
const { sendOTPSMS, verifyOTP } = require('../controllers/otp.controller');

router.post('/send', sendOTPSMS);
router.post('/verify', verifyOTP);

module.exports = router;