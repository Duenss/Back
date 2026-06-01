const express = require('express');
const router = express.Router();
const { generateSDK } = require('../controllers/sdkController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/sdk/generate/:appId
router.get('/generate/:appId', generateSDK);

module.exports = router;
