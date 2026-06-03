const AppUser = require('../models/AppUser');
const License = require('../models/License');
const Application = require('../models/Application');
const Log = require('../models/Log');
const { processHWID } = require('../utils/hwidGenerator');
const { findAuthorizedApp } = require('../utils/appAuthorization');
const { success, badRequest, notFound, serverError } = require('../utils/apiResponse');

/**
 * POST /api/hwid/check
 * Check if a HWID matches the one on record for a user
 */
const checkHWID = async (req, res) => {
  try {
    const { appId, userId, hwid } = req.body;

    if (!appId || !userId || !hwid) {
      return badRequest(res, 'appId, userId, and hwid are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: userId, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    const hashedHwid = processHWID(hwid);
    const matches = user.hwid === hashedHwid;

    return success(res, { matches, hasHwid: !!user.hwid });
  } catch (err) {
    console.error('checkHWID error:', err);
    return serverError(res, 'HWID check failed');
  }
};

/**
 * POST /api/hwid/reset
 * Reset HWID for a user (admin action)
 */
const resetHWID = async (req, res) => {
  try {
    const { appId, userId } = req.body;

    if (!appId || !userId) {
      return badRequest(res, 'appId and userId are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const user = await AppUser.findOne({ _id: userId, appId: app._id });
    if (!user) return notFound(res, 'User not found');

    user.hwid = null;
    await user.save();

    // Also reset on license
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
    return serverError(res, 'HWID reset failed');
  }
};

/**
 * POST /api/hwid/ban
 * Ban a specific HWID across an application
 */
const banHWID = async (req, res) => {
  try {
    const { appId, hwid, reason } = req.body;

    if (!appId || !hwid) {
      return badRequest(res, 'appId and hwid are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const hashedHwid = processHWID(hwid);

    // Ban all users with this HWID
    const result = await AppUser.updateMany(
      { appId: app._id, hwid: hashedHwid },
      { $set: { status: 'banned', banReason: reason || 'HWID banned' } }
    );

    await Log.create({
      appId: app._id,
      event: 'user_banned',
      description: `HWID banned: ${hashedHwid.substring(0, 16)}... (${result.modifiedCount} user(s) affected)`,
      ip: req.ip,
      metadata: { hwid: hashedHwid, reason },
    });

    return success(res, { affectedUsers: result.modifiedCount }, 'HWID banned');
  } catch (err) {
    console.error('banHWID error:', err);
    return serverError(res, 'HWID ban failed');
  }
};

/**
 * POST /api/hwid/unban
 * Unban a specific HWID
 */
const unbanHWID = async (req, res) => {
  try {
    const { appId, hwid } = req.body;

    if (!appId || !hwid) {
      return badRequest(res, 'appId and hwid are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const hashedHwid = processHWID(hwid);

    const result = await AppUser.updateMany(
      { appId: app._id, hwid: hashedHwid, status: 'banned' },
      { $set: { status: 'active', banReason: null } }
    );

    return success(res, { affectedUsers: result.modifiedCount }, 'HWID unbanned');
  } catch (err) {
    console.error('unbanHWID error:', err);
    return serverError(res, 'HWID unban failed');
  }
};

module.exports = {
  checkHWID,
  resetHWID,
  banHWID,
  unbanHWID,
};
