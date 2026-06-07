const express = require('express');
const router = express.Router();
const {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
} = require('../controllers/subscriptionController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// GET /api/subscriptions
router.get('/', requirePermission('createLicenses'), getSubscriptions);

// POST /api/subscriptions
router.post('/', requirePermission('createLicenses'), createSubscription);

// PUT /api/subscriptions/:id
router.put('/:id', requirePermission('createLicenses'), updateSubscription);

// DELETE /api/subscriptions/:id
router.delete('/:id', requirePermission('createLicenses'), deleteSubscription);

module.exports = router;
