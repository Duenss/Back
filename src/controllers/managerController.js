const Manager = require('../models/Manager');
const Application = require('../models/Application');
const Subscription = require('../models/Subscription');
const {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/managers
 * Create a new manager account
 */
const createManager = async (req, res) => {
  try {
    const { username, email, password, appIds = [], permissions = {}, description = '', allowedSubscriptions = [] } = req.body;

    if (!username || !email || !password) {
      return badRequest(res, 'username, email, and password are required');
    }

    // Verify all appIds belong to the owner
    if (appIds.length > 0) {
      const apps = await Application.find({ _id: { $in: appIds }, ownerId: req.user._id });
      if (apps.length !== appIds.length) {
        return badRequest(res, 'One or more application IDs are invalid');
      }
    }

    if (allowedSubscriptions.length > 0) {
      const subscriptions = await Subscription.find({ _id: { $in: allowedSubscriptions } }).select('appId');
      if (subscriptions.length !== allowedSubscriptions.length) {
        return badRequest(res, 'One or more allowed subscriptions are invalid');
      }
      const ownerAppIds = appIds.map((id) => id.toString());
      if (ownerAppIds.length === 0) {
        return badRequest(res, 'App IDs are required when assigning allowed subscriptions');
      }
      const invalid = subscriptions.some((sub) => !ownerAppIds.includes(sub.appId.toString()));
      if (invalid) {
        return badRequest(res, 'Allowed subscriptions must belong to assigned applications');
      }
    }

    const existing = await Manager.findOne({ $or: [{ email }, { username }] });
    if (existing) return conflict(res, 'Username or email already in use');

    const manager = await Manager.create({
      username,
      email,
      password,
      ownerId: req.user._id,
      appIds,
      description: description || '',
      allowedSubscriptions: Array.isArray(allowedSubscriptions) ? allowedSubscriptions : [],
      permissions: {
        createUsers: permissions.createUsers || false,
        createLicenses: permissions.createLicenses || false,
        manageVariables: permissions.manageVariables || false,
        viewLogs: permissions.viewLogs || false,
        viewStats: permissions.viewStats || false,
      },
    });

    return created(res, manager, 'Manager created successfully');
  } catch (err) {
    console.error('createManager error:', err);
    if (err.code === 11000) return conflict(res, 'Username or email already in use');
    return serverError(res, 'Failed to create manager');
  }
};

/**
 * GET /api/managers
 * Get all managers for the current owner
 */
const getManagers = async (req, res) => {
  try {
    const managers = await Manager.find({ ownerId: req.user._id })
      .populate('appIds', 'name appId status')
      .populate('allowedSubscriptions', 'name level description')
      .sort({ createdAt: -1 });

    return success(res, managers);
  } catch (err) {
    console.error('getManagers error:', err);
    return serverError(res, 'Failed to retrieve managers');
  }
};

/**
 * PUT /api/managers/:id
 * Update a manager's permissions or app access
 */
const updateManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { appIds, permissions, isActive, password, description, allowedSubscriptions } = req.body;

    const manager = await Manager.findOne({ _id: id, ownerId: req.user._id });
    if (!manager) return notFound(res, 'Manager not found');

    if (appIds !== undefined) {
      if (appIds.length > 0) {
        const apps = await Application.find({ _id: { $in: appIds }, ownerId: req.user._id });
        if (apps.length !== appIds.length) {
          return badRequest(res, 'One or more application IDs are invalid');
        }
      }
      manager.appIds = appIds;
    }

    if (permissions !== undefined) {
      manager.permissions = {
        createUsers: permissions.createUsers ?? manager.permissions.createUsers,
        createLicenses: permissions.createLicenses ?? manager.permissions.createLicenses,
        manageVariables: permissions.manageVariables ?? manager.permissions.manageVariables,
        viewLogs: permissions.viewLogs ?? manager.permissions.viewLogs,
        viewStats: permissions.viewStats ?? manager.permissions.viewStats,
      };
    }

    if (description !== undefined) manager.description = description;
    if (allowedSubscriptions !== undefined) {
      const subscriptions = await Subscription.find({ _id: { $in: allowedSubscriptions } }).select('appId');
      if (subscriptions.length !== allowedSubscriptions.length) {
        return badRequest(res, 'One or more allowed subscriptions are invalid');
      }
      const selectedAppIds = (appIds !== undefined ? appIds : manager.appIds || []).map((id) => id.toString());
      if (selectedAppIds.length === 0) {
        return badRequest(res, 'App IDs are required when assigning allowed subscriptions');
      }
      const invalid = subscriptions.some((sub) => !selectedAppIds.includes(sub.appId.toString()));
      if (invalid) {
        return badRequest(res, 'Allowed subscriptions must belong to assigned applications');
      }
      manager.allowedSubscriptions = Array.isArray(allowedSubscriptions) ? allowedSubscriptions : manager.allowedSubscriptions;
    }

    if (isActive !== undefined) manager.isActive = isActive;
    if (password) manager.password = password; // will be hashed by pre-save hook

    await manager.save();

    return success(res, manager, 'Manager updated');
  } catch (err) {
    console.error('updateManager error:', err);
    return serverError(res, 'Failed to update manager');
  }
};

/**
 * DELETE /api/managers/:id
 * Delete a manager account
 */
const deleteManager = async (req, res) => {
  try {
    const { id } = req.params;

    const manager = await Manager.findOneAndDelete({ _id: id, ownerId: req.user._id });
    if (!manager) return notFound(res, 'Manager not found');

    return success(res, null, 'Manager deleted');
  } catch (err) {
    console.error('deleteManager error:', err);
    return serverError(res, 'Failed to delete manager');
  }
};

module.exports = {
  createManager,
  getManagers,
  updateManager,
  deleteManager,
};
