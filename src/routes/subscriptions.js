const express = require('express');
const router = express.Router();
const {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
} = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/subscriptions
router.get('/', getSubscriptions);

// POST /api/subscriptions
router.post('/', createSubscription);

// PUT /api/subscriptions/:id
router.put('/:id', updateSubscription);

// DELETE /api/subscriptions/:id
router.delete('/:id', deleteSubscription);

module.exports = router;
