const express = require('express');
const router = express.Router();
const {
  generateLicenses,
  getLicenses,
  deleteLicense,
  resetLicenseHwid,
  pauseLicense,
  banLicense,
  deleteAllLicenses,
  deleteUsedLicenses,
  deleteUnusedLicenses,
  deleteExpiredLicenses,
  loginWithLicense,
  checkLicense,
  activateLicense,
  authWithKey,
} = require('../controllers/licenseController');
const { authenticate } = require('../middleware/auth');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// SDK-facing routes (validated by app credentials, not JWT)
router.post('/login', sdkLimiter, validateApp, loginWithLicense);
router.post('/check', sdkLimiter, validateApp, checkLicense);
router.post('/activate', sdkLimiter, validateApp, activateLicense);
router.post('/auth', sdkLimiter, validateApp, authWithKey);  // login-only-with-key

// Dashboard routes (require JWT)
router.use(authenticate);

router.get('/', getLicenses);
router.post('/generate', generateLicenses);
router.post('/:key/reset-hwid', resetLicenseHwid);
router.post('/:key/pause', pauseLicense);
router.post('/:key/ban', banLicense);

// Bulk delete routes
router.delete('/bulk/all', deleteAllLicenses);
router.delete('/bulk/used', deleteUsedLicenses);
router.delete('/bulk/unused', deleteUnusedLicenses);
router.delete('/bulk/expired', deleteExpiredLicenses);

// Single license delete
router.delete('/:key', deleteLicense);

module.exports = router;
