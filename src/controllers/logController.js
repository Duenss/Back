const Log = require('../models/Log');
const Application = require('../models/Application');
const { findAuthorizedApp } = require('../utils/appAuthorization');
const { success, badRequest, notFound, serverError } = require('../utils/apiResponse');

/**
 * GET /api/logs
 * Get logs for an application with optional filtering
 */
const getLogs = async (req, res) => {
  try {
    const { appId, event, page = 1, limit = 100, startDate, endDate } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const filter = { appId: app._id };
    if (event) filter.event = event;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      Log.find(filter)
        .populate('userId', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Log.countDocuments(filter),
    ]);

    return success(res, {
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('getLogs error:', err);
    return serverError(res, 'Failed to retrieve logs');
  }
};

/**
 * DELETE /api/logs
 * Clear all logs for an application
 */
const clearLogs = async (req, res) => {
  try {
    const { appId } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const result = await Log.deleteMany({ appId: app._id });

    return success(res, { deleted: result.deletedCount }, 'Logs cleared');
  } catch (err) {
    console.error('clearLogs error:', err);
    return serverError(res, 'Failed to clear logs');
  }
};

module.exports = {
  getLogs,
  clearLogs,
};
