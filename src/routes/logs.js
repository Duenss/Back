const express = require('express');
const router = express.Router();
const { getLogs, clearLogs } = require('../controllers/logController');
const { authenticate, requirePermission, validateManagerAppAccess, managerOwnerSubscriptionInheritance } = require('../middleware/auth');

router.use(authenticate);
router.use(managerOwnerSubscriptionInheritance); // Inherit owner subscription

// GET /api/logs
router.get('/', requirePermission('viewLogs'), getLogs);

// DELETE /api/logs
router.delete('/', requirePermission('viewLogs'), validateManagerAppAccess, clearLogs);

module.exports = router;
