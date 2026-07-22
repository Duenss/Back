const express = require('express');
const router = express.Router();
const { generateSDK, getSDKBroadcast } = require('../controllers/sdkController');
const { authenticate } = require('../middleware/auth');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// ── SDK-facing route: get active broadcast (validated by app credentials) ──
// No JWT required — uses x-app-id + x-app-secret headers
router.get('/broadcast', sdkLimiter, validateApp, getSDKBroadcast);

// ── Dashboard routes (require JWT) ───────────────────────────────────────
router.use(authenticate);

// GET /api/sdk/generate/:appId
router.get('/generate/:appId', generateSDK);

module.exports = router;
