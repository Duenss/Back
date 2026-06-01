const AppUser = require('../models/AppUser');
const Application = require('../models/Application');
const License = require('../models/License');
const Log = require('../models/Log');
const { notifyUserBanned } = require('../utils/discordWebhook');
const {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/users
 * Create an app user manually (without license activation)
 */
const createUser = async (req, res) => {
  try {
    const { appId, username, password, subscriptionId, expiresAt } = req.body;

    if (!appId || !username || !password) {
      return badRequest(res, 'appId, username, and password are required');
    }

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const existing = await AppUser.findOne({ username, appId: app._id });
    if (existing) return conflict(res, 'Username already exists in this application');

    const user = await AppUser.create({
      username,
      password,
      appId: app._id,
      subscription: subscriptionId || null,
      expiresAt: expiresAt || null,
      ip: req.ip,
    });

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'user_created',
      description: `User ${username} created manually`,
      ip: req.ip,
    });

    return created(res, user, 'User created successfully');
  } catch (err) {
    console.error('createUser error:', err);
    if (err.code === 11000) return conflict(res, 'Username already exists');
    return serverError(res, 'Failed to create user');
  }
};

/**
 * GET /api/users
 * Get all users for an application
 */
const getUsers = async (req, res) => {
  try {
    const { appId, status, page = 1, limit = 50, search } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const filter = { appId: app._id };
    if (status) filter.status = status;
    if (search) filter.username = { $regex: search, $options: 'i' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      AppUser.find(filter)
        .populate('subscription', 'name level')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AppUser.countDocuments(filter),
    ]);

    return success(res, {
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('getUsers error:', err);
    return serverError(res, 'Failed to retrieve users');
  }
};

/**
 * DELETE /api/users/:id
 * Delete an app user
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: id, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    // Reset associated license
    await License.updateOne(
      { usedBy: user._id },
      { $set: { status: 'unused', usedBy: null, usedAt: null, hwid: null } }
    );

    await user.deleteOne();

    await Log.create({
      appId: app._id,
      event: 'user_deleted',
      description: `User ${user.username} deleted`,
      ip: req.ip,
    });

    return success(res, null, 'User deleted');
  } catch (err) {
    console.error('deleteUser error:', err);
    return serverError(res, 'Failed to delete user');
  }
};

/**
 * POST /api/users/:id/ban
 * Ban an app user
 */
const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId, reason } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: id, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    user.status = 'banned';
    user.banReason = reason || 'No reason provided';
    await user.save();

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'user_banned',
      description: `User ${user.username} banned. Reason: ${user.banReason}`,
      ip: req.ip,
    });

    if (app.webhookUrl) {
      notifyUserBanned(app.webhookUrl, { username: user.username, reason: user.banReason, appName: app.name });
    }

    return success(res, user, 'User banned');
  } catch (err) {
    console.error('banUser error:', err);
    return serverError(res, 'Failed to ban user');
  }
};

/**
 * POST /api/users/:id/unban
 * Unban an app user
 */
const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: id, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    user.status = 'active';
    user.banReason = null;
    await user.save();

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'user_unbanned',
      description: `User ${user.username} unbanned`,
      ip: req.ip,
    });

    return success(res, user, 'User unbanned');
  } catch (err) {
    console.error('unbanUser error:', err);
    return serverError(res, 'Failed to unban user');
  }
};

/**
 * POST /api/users/:id/reset-hwid
 * Reset HWID for an app user
 */
const resetHWID = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: id, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    user.hwid = null;
    await user.save();

    // Also reset HWID on associated license
    await License.updateOne({ usedBy: user._id }, { $set: { hwid: null } });

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'hwid_reset',
      description: `HWID reset for user ${user.username}`,
      ip: req.ip,
    });

    return success(res, null, 'HWID reset successfully');
  } catch (err) {
    console.error('resetHWID error:', err);
    return serverError(res, 'Failed to reset HWID');
  }
};

module.exports = {
  createUser,
  getUsers,
  deleteUser,
  banUser,
  unbanUser,
  resetHWID,
};
