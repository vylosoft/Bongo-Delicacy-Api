const router = require('express').Router();

router.use('/menu', require('./menu.routes'));
router.use('/resturents', require('./resturents.route'));
router.use('/outlet', require('./outlet.routes.js'));
router.use('/payment', require('./payment.routes')); // now works after fixing payment.routes.js
router.use("/petpuja", require("./petpuja.routes"));
router.use("/reservation", require("./reservation.routes.js") );
router.use("/complaints", require("./complaint.routes.js") );
router.use('/ai', require('./ai.routes'));
router.use('/rider', require('./rider.routes.js'));
router.use("/webhooks", require("./webhooks.routes.js"));
router.use('/outlet-table', require('./outletTable.route.js'));

module.exports = router;

