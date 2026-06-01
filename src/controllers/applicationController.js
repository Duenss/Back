const { v4: uuidv4 } = require('uuid');
const Application = require('../models/Application');
const License = require('../models/License');
const AppUser = require('../models/AppUser');
const Log = require('../models/Log');
const Variable = require('../models/Variable');
const Subscription = require('../models/Subscription');
const { sendWebhook } = require('../utils/discordWebhook');
const {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/applications
 * Create a new application
 */
const createApp = async (req, res) => {
  try {
    const { name, version, webhookUrl, hwidLock } = req.body;

    if (!name) {
      return badRequest(res, 'Application name is required');
    }

    // Limite de apps para usuarios normales (superadmin/admin sin limite)
    if (req.user.role === 'user' || req.user.role === 'manager') {
      const count = await Application.countDocuments({ ownerId: req.user._id });
      if (count >= 3) {
        return forbidden(res, 'Free plan limit: maximum 3 applications allowed');
      }
    }

    const app = await Application.create({
      name,
      version: version || '1.0.0',
      webhookUrl: webhookUrl || null,
      hwidLock: hwidLock !== undefined ? hwidLock : true,
      ownerId: req.user._id,
    });

    // Fetch with secret for the creator
    const appWithSecret = await Application.findById(app._id).select('+appSecret');

    return created(res, appWithSecret, 'Application created successfully');
  } catch (err) {
    console.error('createApp error:', err);
    if (err.code === 11000) {
      return conflict(res, 'Application with this name already exists');
    }
    return serverError(res, 'Failed to create application');
  }
};

/**
 * GET /api/applications
 * List all applications owned by the current user
 */
const getApps = async (req, res) => {
  try {
    // Siempre filtrar por ownerId — superadmin solo ve sus propias apps
    const query = { ownerId: req.user._id };
    const apps = await Application.find(query).sort({ createdAt: -1 });

    // Attach counts
    const appsWithCounts = await Promise.all(
      apps.map(async (app) => {
        const [userCount, licenseCount] = await Promise.all([
          AppUser.countDocuments({ appId: app._id }),
          License.countDocuments({ appId: app._id }),
        ]);
        return { ...app.toObject(), userCount, licenseCount };
      })
    );

    return success(res, appsWithCounts, 'Applications retrieved');
  } catch (err) {
    console.error('getApps error:', err);
    return serverError(res, 'Failed to retrieve applications');
  }
};

/**
 * GET /api/applications/:id
 * Get a single application by MongoDB _id or appId UUID
 */
const getApp = async (req, res) => {
  try {
    const { id } = req.params;
    const app = await Application.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { appId: id }],
      ownerId: req.user._id,
    }).select('+appSecret');

    if (!app) {
      return notFound(res, 'Application not found');
    }

    const [userCount, licenseCount, activeUsers] = await Promise.all([
      AppUser.countDocuments({ appId: app._id }),
      License.countDocuments({ appId: app._id }),
      AppUser.countDocuments({ appId: app._id, status: 'active' }),
    ]);

    return success(
      res,
      { ...app.toObject(), userCount, licenseCount, activeUsers },
      'Application retrieved'
    );
  } catch (err) {
    console.error('getApp error:', err);
    return serverError(res, 'Failed to retrieve application');
  }
};

/**
 * PUT /api/applications/:id
 * Update application details
 */
const updateApp = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, version, webhookUrl, hwidLock, allowMultipleSessions } = req.body;

    const app = await Application.findOne({
      _id: id,
      ownerId: req.user._id,
    });

    if (!app) {
      return notFound(res, 'Application not found');
    }

    if (name !== undefined) app.name = name;
    if (version !== undefined) app.version = version;
    if (webhookUrl !== undefined) app.webhookUrl = webhookUrl;
    if (hwidLock !== undefined) app.hwidLock = hwidLock;
    if (allowMultipleSessions !== undefined) app.allowMultipleSessions = allowMultipleSessions;

    await app.save();

    return success(res, app, 'Application updated');
  } catch (err) {
    console.error('updateApp error:', err);
    return serverError(res, 'Failed to update application');
  }
};

/**
 * DELETE /api/applications/:id
 * Delete application and all associated data
 */
const deleteApp = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, ownerId: req.user._id });
    if (!app) {
      return notFound(res, 'Application not found');
    }

    // Cascade delete all related data
    await Promise.all([
      License.deleteMany({ appId: app._id }),
      AppUser.deleteMany({ appId: app._id }),
      Variable.deleteMany({ appId: app._id }),
      Subscription.deleteMany({ appId: app._id }),
      Log.deleteMany({ appId: app._id }),
    ]);

    await app.deleteOne();

    return success(res, null, 'Application and all associated data deleted');
  } catch (err) {
    console.error('deleteApp error:', err);
    return serverError(res, 'Failed to delete application');
  }
};

/**
 * POST /api/applications/:id/regenerate-secret
 * Regenerate the application secret
 */
const regenerateSecret = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, ownerId: req.user._id }).select('+appSecret');
    if (!app) {
      return notFound(res, 'Application not found');
    }

    app.appSecret = uuidv4();
    await app.save();

    return success(res, { appSecret: app.appSecret }, 'App secret regenerated. Update your SDK.');
  } catch (err) {
    console.error('regenerateSecret error:', err);
    return serverError(res, 'Failed to regenerate secret');
  }
};

/**
 * GET /api/applications/:id/secret
 * Return the current application secret for dashboard reveal actions.
 */
const getAppSecret = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, ownerId: req.user._id }).select('+appSecret');
    if (!app) {
      return notFound(res, 'Application not found');
    }

    return success(res, { appSecret: app.appSecret }, 'App secret retrieved');
  } catch (err) {
    console.error('getAppSecret error:', err);
    return serverError(res, 'Failed to retrieve app secret');
  }
};

/**
 * POST /api/applications/:id/pause
 * Toggle application pause/resume
 */
const pauseApp = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, ownerId: req.user._id });
    if (!app) {
      return notFound(res, 'Application not found');
    }

    app.status = app.status === 'active' ? 'paused' : 'active';
    await app.save();

    const event = app.status === 'paused' ? 'app_paused' : 'app_resumed';
    await Log.create({
      appId: app._id,
      event,
      description: `Application ${app.status === 'paused' ? 'paused' : 'resumed'} by owner`,
      ip: req.ip,
    });

    return success(res, { status: app.status }, `Application ${app.status}`);
  } catch (err) {
    console.error('pauseApp error:', err);
    return serverError(res, 'Failed to update application status');
  }
};

/**
 * POST /api/applications/:id/test-webhook
 * Send a test message to the application's configured Discord webhook.
 */
const testWebhook = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, ownerId: req.user._id });
    if (!app) {
      return notFound(res, 'Application not found');
    }
    if (!app.webhookUrl) {
      return badRequest(res, 'Application does not have a webhook URL configured');
    }

    await sendWebhook(app.webhookUrl, {
      event: 'info',
      title: 'Webhook Connected',
      description: `Discord webhook is connected for **${app.name}**.`,
      fields: [
        { name: 'Application', value: app.name, inline: true },
        { name: 'Version', value: app.version || '1.0.0', inline: true },
      ],
      appName: app.name,
    });

    await Log.create({
      appId: app._id,
      event: 'variable_updated',
      description: 'Discord webhook test sent',
      ip: req.ip,
    });

    return success(res, null, 'Webhook test sent');
  } catch (err) {
    console.error('testWebhook error:', err);
    return serverError(res, 'Failed to test webhook');
  }
};

module.exports = {
  createApp,
  getApps,
  getApp,
  updateApp,
  deleteApp,
  regenerateSecret,
  getAppSecret,
  pauseApp,
  testWebhook,
};
