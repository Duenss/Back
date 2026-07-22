const Application = require('../models/Application');
const { unauthorized, forbidden, notFound, serverError } = require('../utils/apiResponse');

/**
 * Middleware to validate APP_ID and APP_SECRET from request headers.
 * Attaches the application document to req.application.
 *
 * Expected headers:
 *   x-app-id: <appId UUID>
 *   x-app-secret: <appSecret UUID>
 */
const validateApp = async (req, res, next) => {
  try {
    const appId = req.headers['x-app-id'];
    const appSecret = req.headers['x-app-secret'];

    if (!appId || !appSecret) {
      return unauthorized(res, 'Missing application credentials (x-app-id, x-app-secret)');
    }

    // Fetch app with secret (normally excluded)
    const application = await Application.findOne({ appId }).select('+appSecret');

    if (!application) {
      return notFound(res, 'Application not found');
    }

    if (application.appSecret !== appSecret) {
      return unauthorized(res, 'Invalid application secret');
    }

    if (application.status === 'paused') {
      return forbidden(res, 'This application is currently paused');
    }

    req.application = application;
    next();
  } catch (err) {
    console.error('validateApp middleware error:', err);
    return serverError(res, 'Application validation error');
  }
};

module.exports = validateApp;
