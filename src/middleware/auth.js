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
      // Determine effective subscription level (owner for managers)
      const effectiveSubscriptionLevel = (req.user && (req.user.inheritedSubscriptionLevel || req.user.subscriptionLevel)) || 0;
      const isPaid = Number(effectiveSubscriptionLevel) > 0;
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
      user.role = 'manager';
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
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
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
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && req.user.role !== 'manager' && !req.user.isManager) {
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
    // Admins and superadmins bypass permission checks
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
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

/**
 * Require superadmin role — solo el dev puede acceder
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return forbidden(res, 'Superadmin access required');
  }
  next();
};

/**
 * Limites del plan para usuarios normales (role: 'user')
 * superadmin y admin no tienen limites
 */
const PLAN_LIMITS = {
  maxApps: 3,
  maxLicensesPerGeneration: 10,
  maxUsersPerApp: 10,
};

const checkPlanLimits = (type) => {
  return async (req, res, next) => {
    // superadmin y admin sin limites
    if (!req.user || req.user.role === 'superadmin' || req.user.role === 'admin') {
      return next();
    }

    try {
      if (type === 'apps') {
        // Managers cannot create applications
        if (req.user.isManager) {
          return forbidden(res, 'Managers cannot create applications');
        }
        const Application = require('../models/Application');
        const count = await Application.countDocuments({ ownerId: req.user._id });
        if (!isPaid && count >= PLAN_LIMITS.maxApps) {
          return forbidden(res, `Free plan limit: maximum ${PLAN_LIMITS.maxApps} applications allowed`);
        }
      }

      if (type === 'licenses') {
        const count = parseInt(req.body.count) || 1;
        if (!isPaid && count > PLAN_LIMITS.maxLicensesPerGeneration) {
          return forbidden(res, `Free plan limit: maximum ${PLAN_LIMITS.maxLicensesPerGeneration} licenses per generation`);
        }
        // Verificar total de licencias en la app
        const License = require('../models/License');
        const { findAuthorizedApp } = require('../utils/appAuthorization');
        const app = await findAuthorizedApp(req.user, req.body.appId);
        if (app) {
          if (!isPaid) {
            const total = await License.countDocuments({ appId: app._id });
            if (total + count > PLAN_LIMITS.maxLicensesPerGeneration) {
              return forbidden(res, `Free plan limit: maximum ${PLAN_LIMITS.maxLicensesPerGeneration} total licenses per application`);
            }
          }
        }
      }

      if (type === 'users') {
        const AppUser = require('../models/AppUser');
        const { findAuthorizedApp } = require('../utils/appAuthorization');
        const appId = req.body.appId || req.query.appId;
        if (appId) {
          const app = await findAuthorizedApp(req.user, appId);
          if (app) {
            if (!isPaid) {
              const count = await AppUser.countDocuments({ appId: app._id });
              if (count >= PLAN_LIMITS.maxUsersPerApp) {
                return forbidden(res, `Free plan limit: maximum ${PLAN_LIMITS.maxUsersPerApp} users per application`);
              }
            }
          }
        }
      }

      next();
    } catch (err) {
      console.error('checkPlanLimits error:', err);
      next();
    }
  };
};

/**
 * Validate that managers can only access their assigned apps
 * For endpoints with appId in body/params, ensure manager has access
 */
const validateManagerAppAccess = async (req, res, next) => {
  if (!req.user || !req.user.isManager) {
    return next(); // Not a manager, skip validation
  }

  // Get appId from various sources
  const appId = req.body?.appId || req.query?.appId || req.params?.appId || req.params?.id;
  
  if (!appId) {
    return next(); // No app specified, allow
  }

  // Check if manager has access to this app
  const Application = require('../models/Application');
  const app = await Application.findById(appId);
  
  if (!app) {
    return forbidden(res, 'Application not found');
  }

  // Verify this manager is assigned to this app
  const hasAccess = req.user.appIds && req.user.appIds.some(id => id.toString() === appId.toString());
  
  if (!hasAccess) {
    return forbidden(res, 'Access denied: This application is not assigned to your account');
  }

  next();
};

/**
 * Ensure managers inherit their owner's subscription tier for plan limits
 * and validate subscription status before allowing operations
 */
const managerOwnerSubscriptionInheritance = async (req, res, next) => {
  if (!req.user || !req.user.isManager) {
    return next(); // Not a manager, skip
  }

  try {
    // Get owner's subscription status
    const User = require('../models/User');
    const owner = await User.findById(req.user.ownerId).select('subscriptionTier subscriptionLevel');
    
    if (!owner) {
      return forbidden(res, 'Owner account not found');
    }

    // Attach owner's subscription to manager context
    req.user.inheritedSubscriptionTier = owner.subscriptionTier || 'free';
    req.user.inheritedSubscriptionLevel = owner.subscriptionLevel || 0;
    
    next();
  } catch (err) {
    console.error('managerOwnerSubscriptionInheritance error:', err);
    return serverError(res, 'Subscription validation error');
  }
};

module.exports = {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requireAdminOrManager,
  requirePermission,
  checkPlanLimits,
  PLAN_LIMITS,
  validateManagerAppAccess,
  managerOwnerSubscriptionInheritance,
};
