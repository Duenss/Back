const express = require('express');
const router = express.Router();
const { getLogs, clearLogs } = require('../controllers/logController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/logs
router.get('/', getLogs);

// DELETE /api/logs
router.delete('/', clearLogs);

module.exports = router;
