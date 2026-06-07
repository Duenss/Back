const express = require('express');
const router = express.Router();
const {
  createApp,
  getApps,
  getApp,
  getAppStats,
  updateApp,
  deleteApp,
  regenerateSecret,
  getAppSecret,
  pauseApp,
  testWebhook,
} = require('../controllers/applicationController');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/applications
router.get('/', getApps);

// POST /api/applications
router.post('/', requireAdmin, createApp);

// GET /api/applications/:id
router.get('/:id', getApp);

// GET /api/applications/:id/stats
router.get('/:id/stats', requirePermission('viewStats'), getAppStats);

// GET /api/applications/:id/secret
router.get('/:id/secret', requireAdmin, getAppSecret);

// PUT /api/applications/:id
router.put('/:id', requireAdmin, updateApp);

// DELETE /api/applications/:id
router.delete('/:id', requireAdmin, deleteApp);

// POST /api/applications/:id/regenerate-secret
router.post('/:id/regenerate-secret', requireAdmin, regenerateSecret);

// POST /api/applications/:id/pause
router.post('/:id/pause', requireAdmin, pauseApp);

// PATCH /api/applications/:id/pause
router.patch('/:id/pause', requireAdmin, pauseApp);

// POST /api/applications/:id/test-webhook
router.post('/:id/test-webhook', requireAdmin, testWebhook);

module.exports = router;
