const mongoose = require('mongoose');
const Application = require('../models/Application');

const buildAppQueryForUser = (user, appId) => {
  const query = {};
  if (appId) {
    if (mongoose.Types.ObjectId.isValid(appId)) {
      query._id = appId;
    } else {
      query.appId = appId;
    }
  }

  query.$or = [{ ownerId: user._id }];
  if (user.isManager && Array.isArray(user.appIds) && user.appIds.length > 0) {
    query.$or.push({ _id: { $in: user.appIds } });
  }

  return query;
};

const findAuthorizedApp = async (user, appId) => {
  if (!appId) return null;
  return Application.findOne(buildAppQueryForUser(user, appId));
};

const findAuthorizedApps = async (user) => {
  if (user.isManager && Array.isArray(user.appIds)) {
    return Application.find({ _id: { $in: user.appIds } }).sort({ createdAt: -1 });
  }
  return Application.find({ ownerId: user._id }).sort({ createdAt: -1 });
};

module.exports = {
  buildAppQueryForUser,
  findAuthorizedApp,
  findAuthorizedApps,
};
