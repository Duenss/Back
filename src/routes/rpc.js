const express = require('express');
const router = express.Router();
const License = require('../models/License');
const AppUser = require('../models/AppUser');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// POST /rpc/user-info
router.post('/user-info', sdkLimiter, validateApp, async (req, res) => {
  try {
    const { licenseKey, appId } = req.body;
    if (!licenseKey || !appId) return res.status(400).json({ success: false, error: 'licenseKey and appId are required' });

    const license = await License.findOne({ keyNormalized: licenseKey.toUpperCase(), appId }).populate('subscription');
    if (!license) return res.json({ success: false, error: 'License not found' });

    const user = license.usedBy ? await AppUser.findById(license.usedBy) : null;

    return res.json({
      success: true,
      data: {
        user: user ? { username: user.username, hwid: user.hwid, subscription: user.subscription, expiresAt: user.expiresAt } : null,
        application: appId,
        license: { key: license.key, subscription: license.subscription, expiresAt: license.expiresAt },
        isValid: license.isValid(),
      },
    });
  } catch (err) {
    console.error('rpc user-info error:', err);
    return res.status(500).json({ success: false, error: 'RPC error' });
  }
});

module.exports = router;
