const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Manager = require('../models/Manager');
const { unauthorized, forbidden, serverError } = require('../utils/apiResponse');

/**
 * Verify JWT and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return unauthorized(res, 'No token provided');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return unauthorized(res, 'Token has expired');
      }
      return unauthorized(res, 'Invalid token');
    }

    // Support both platform users and managers
    let user = await User.findById(decoded.id).select('+password');
    if (!user) {
      user = await Manager.findById(decoded.id);
      if (!user) {
        return unauthorized(res, 'User not found');
      }
      user.isManager = true;
    }

    if (user.isBanned) {
      return forbidden(res, `Account is banned: ${user.banReason || 'No reason provided'}`);
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return serverError(res, 'Authentication error');
  }
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return forbidden(res, 'Admin access required');
  }
  next();
};

/**
 * Require admin or manager role
 */
const requireAdminOrManager = (req, res, next) => {
  if (!req.user) {
    return unauthorized(res, 'Authentication required');
  }
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && !req.user.isManager) {
    return forbidden(res, 'Insufficient permissions');
  }
  next();
};

/**
 * Check specific manager permission
 * @param {string} permission - Permission key from Manager.permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorized(res, 'Authentication required');
    }
    // Admins bypass permission checks
    if (req.user.role === 'admin') {
      return next();
    }
    // Check manager permission
    if (req.user.isManager) {
      if (!req.user.permissions || !req.user.permissions[permission]) {
        return forbidden(res, `Permission denied: ${permission}`);
      }
      return next();
    }
    return forbidden(res, 'Insufficient permissions');
  };
};

module.exports = {
  authenticate,
  requireAdmin,
  requireAdminOrManager,
  requirePermission,
};
