const express = require('express');
const router = express.Router();
const {
  createApp,
  getApps,
  getApp,
  updateApp,
  deleteApp,
  regenerateSecret,
  getAppSecret,
  pauseApp,
  testWebhook,
} = require('../controllers/applicationController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/applications
router.get('/', getApps);

// POST /api/applications
router.post('/', createApp);

// GET /api/applications/:id
router.get('/:id', getApp);

// GET /api/applications/:id/secret
router.get('/:id/secret', getAppSecret);

// PUT /api/applications/:id
router.put('/:id', updateApp);

// DELETE /api/applications/:id
router.delete('/:id', deleteApp);

// POST /api/applications/:id/regenerate-secret
router.post('/:id/regenerate-secret', regenerateSecret);

// POST /api/applications/:id/pause
router.post('/:id/pause', pauseApp);

// PATCH /api/applications/:id/pause
router.patch('/:id/pause', pauseApp);

// POST /api/applications/:id/test-webhook
router.post('/:id/test-webhook', testWebhook);

module.exports = router;
