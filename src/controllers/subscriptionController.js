const Subscription = require('../models/Subscription');
const Application = require('../models/Application');
const { findAuthorizedApp } = require('../utils/appAuthorization');
const {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/subscriptions
 * Create a new subscription tier
 */
const createSubscription = async (req, res) => {
  try {
    const { appId, name, level, description } = req.body;

    if (!appId || !name || level === undefined) {
      return badRequest(res, 'appId, name, and level are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const existing = await Subscription.findOne({ name, appId: app._id });
    if (existing) return conflict(res, `Subscription "${name}" already exists`);

    const subscription = await Subscription.create({
      name,
      level,
      description: description || '',
      appId: app._id,
    });

    return created(res, subscription, 'Subscription created');
  } catch (err) {
    console.error('createSubscription error:', err);
    if (err.code === 11000) return conflict(res, 'Subscription name already exists');
    return serverError(res, 'Failed to create subscription');
  }
};

/**
 * GET /api/subscriptions
 * Get all subscriptions for an application
 */
const getSubscriptions = async (req, res) => {
  try {
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const subscriptions = await Subscription.find({ appId: app._id }).sort({ level: 1 });

    return success(res, subscriptions);
  } catch (err) {
    console.error('getSubscriptions error:', err);
    return serverError(res, 'Failed to retrieve subscriptions');
  }
};

/**
 * PUT /api/subscriptions/:id
 * Update a subscription
 */
const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId, name, level, duration, durationUnit, description } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const subscription = await Subscription.findOne({ _id: id, appId: app._id });
    if (!subscription) return notFound(res, 'Subscription not found');

    if (name !== undefined) subscription.name = name;
    if (level !== undefined) subscription.level = level;
    if (duration !== undefined) subscription.duration = duration;
    if (durationUnit !== undefined) subscription.durationUnit = durationUnit;
    if (description !== undefined) subscription.description = description;

    await subscription.save();

    return success(res, subscription, 'Subscription updated');
  } catch (err) {
    console.error('updateSubscription error:', err);
    return serverError(res, 'Failed to update subscription');
  }
};

/**
 * DELETE /api/subscriptions/:id
 * Delete a subscription
 */
const deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const subscription = await Subscription.findOneAndDelete({ _id: id, appId: app._id });
    if (!subscription) return notFound(res, 'Subscription not found');

    return success(res, null, 'Subscription deleted');
  } catch (err) {
    console.error('deleteSubscription error:', err);
    return serverError(res, 'Failed to delete subscription');
  }
};

module.exports = {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
};
