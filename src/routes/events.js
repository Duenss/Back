const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const Event = require('../models/Event');

router.use(authenticate);

// GET /api/events/temporary - get recent temporary events for current user
router.get('/temporary', async (req, res) => {
  try {
    const userId = req.user._id;
    const events = await Event.find({ userId, isTemporary: true, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error('get temporary events error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve events' });
  }
});

// GET /api/events/history - get historical logs (requires viewLogs permission)
router.get('/history', requirePermission('viewLogs'), async (req, res) => {
  try {
    const { appId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (appId) filter.appId = appId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const events = await Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Event.countDocuments(filter);
    return res.json({ success: true, data: events, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('get events history error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve event history' });
  }
});

module.exports = router;
