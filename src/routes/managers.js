const express = require('express');
const router = express.Router();
const {
  createManager,
  getManagers,
  updateManager,
  deleteManager,
} = require('../controllers/managerController');
const { authenticate, requireAdmin, validateManagerAppAccess } = require('../middleware/auth');

router.use(authenticate);

// GET /api/managers/me/assigned-app - return assigned app for the authenticated manager
router.get('/me/assigned-app', authenticate, async (req, res) => {
  try {
    const Manager = require('../models/Manager');
    const id = req.user._id;
    const manager = await Manager.findById(id).select('appIds');
    if (!manager) return res.status(404).json({ success: false, error: 'Manager not found' });
    const appId = (manager.appIds && manager.appIds.length > 0) ? manager.appIds[0] : null;
    return res.json({ success: true, data: { appId } });
  } catch (err) {
    console.error('assigned-app error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get assigned app' });
  }
});

// Admin-only manager management routes
router.get('/', requireAdmin, getManagers);
router.post('/', requireAdmin, createManager);
router.put('/:id', requireAdmin, updateManager);
router.delete('/:id', requireAdmin, deleteManager);

module.exports = router;
