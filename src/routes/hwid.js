const express = require('express');
const router = express.Router();
const { checkHWID, resetHWID, banHWID, unbanHWID } = require('../controllers/hwidController');
const { authenticate, managerOwnerSubscriptionInheritance } = require('../middleware/auth');

router.use(authenticate);
router.use(managerOwnerSubscriptionInheritance);

// POST /api/hwid/check
router.post('/check', checkHWID);

// POST /api/hwid/reset
router.post('/reset', resetHWID);

// POST /api/hwid/ban
router.post('/ban', banHWID);

// POST /api/hwid/unban
router.post('/unban', unbanHWID);

module.exports = router;
