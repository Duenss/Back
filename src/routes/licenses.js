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
const { authenticate, requirePermission, validateManagerAppAccess, managerOwnerSubscriptionInheritance } = require('../middleware/auth');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// SDK-facing routes (validated by app credentials, not JWT)
router.post('/login', sdkLimiter, validateApp, loginWithLicense);
router.post('/check', sdkLimiter, validateApp, checkLicense);
router.post('/activate', sdkLimiter, validateApp, activateLicense);
router.post('/auth', sdkLimiter, validateApp, authWithKey);  // login-only-with-key

// Dashboard routes (require JWT)
router.use(authenticate);
router.use(managerOwnerSubscriptionInheritance); // Inherit owner subscription for plan limits

router.get('/', requirePermission('createLicenses'), getLicenses);
router.post('/generate', requirePermission('createLicenses'), validateManagerAppAccess, generateLicenses);
router.post('/:key/reset-hwid', requirePermission('createLicenses'), validateManagerAppAccess, resetLicenseHwid);
router.post('/:key/pause', requirePermission('createLicenses'), validateManagerAppAccess, pauseLicense);
router.post('/:key/ban', requirePermission('createLicenses'), validateManagerAppAccess, banLicense);

// Bulk delete routes
router.delete('/bulk/all', requirePermission('createLicenses'), validateManagerAppAccess, deleteAllLicenses);
router.delete('/bulk/used', requirePermission('createLicenses'), validateManagerAppAccess, deleteUsedLicenses);
router.delete('/bulk/unused', requirePermission('createLicenses'), validateManagerAppAccess, deleteUnusedLicenses);
router.delete('/bulk/expired', requirePermission('createLicenses'), validateManagerAppAccess, deleteExpiredLicenses);

// Single license delete
router.delete('/:key', requirePermission('createLicenses'), validateManagerAppAccess, deleteLicense);

module.exports = router;
