const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Manager = require('../models/Manager');
const Application = require('../models/Application');
const Log = require('../models/Log');
const Event = require('../models/Event');
const { notifyLogin, notifyLoginFailed, notifyPanelLogin, notifyPanelLoginFailed } = require('../utils/discordWebhook');
const { normalizeIp } = require('../utils/ipNormalizer');
const { success, created, badRequest, unauthorized, forbidden, conflict, serverError } = require('../utils/apiResponse');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required for authentication');
}

/**
 * Generate a signed JWT for a user
 */
const signToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  });
};

/**
 * POST /api/auth/register
 * Register a new admin account
 */
const register = async (req, res) => {
  try {
    const { username, email, password, registrationCode: submittedCode } = req.body;

    if (!username || !email || !password) {
      return badRequest(res, 'Username, email, and password are required');
    }

    if (password.length < 8) {
      return badRequest(res, 'Password must be at least 8 characters');
    }

    const allowPublicRegistration = String(process.env.ALLOW_PUBLIC_REGISTRATION || 'false').toLowerCase() === 'true';
    const registrationCode = process.env.ADMIN_REGISTRATION_CODE;
    const existingUserCount = await User.countDocuments();

    if (registrationCode) {
      if (!submittedCode || submittedCode !== registrationCode) {
        return forbidden(res, 'Invalid registration code');
      }
    } else if (!allowPublicRegistration && existingUserCount > 0) {
      return forbidden(res, 'Registration disabled after initial setup');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.trim();

    const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] });
    if (existingUser) {
      return conflict(res, 'Username or email already in use');
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      role: 'admin',
    });

    const token = signToken(user._id, user.role);

    return created(res, { token, user }, 'Account created successfully');
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 11000) {
      return conflict(res, 'Username or email already in use');
    }
    return serverError(res, 'Registration failed');
  }
};

/**
 * POST /api/auth/login
 * Login with email/username and password
 */
const login = async (req, res) => {
  try {
    const { email, username, identifier, password } = req.body;
    const clientIp = req.ip;

    const id = identifier || email || username;
    if (!id || !password) {
      return badRequest(res, 'Email/username and password are required');
    }

    // identifier can be email or username
    const isEmail = id.includes('@');
    const query = isEmail ? { email: id.toLowerCase() } : { username: id };
    let user = await User.findOne(query).select('+password');
    let isManagerLogin = false;

    if (!user) {
      user = await Manager.findOne(query).select('+password');
      if (user) {
        isManagerLogin = true;
        user.isManager = true;
        user.role = 'manager';
      }
    }

    if (!user) {
      return unauthorized(res, 'Invalid credentials');
    }

    if (isManagerLogin && !user.isActive) {
      return unauthorized(res, 'Manager account is inactive');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const apps = isManagerLogin
        ? await Application.find({ _id: { $in: user.appIds || [] } })
        : await Application.find({ ownerId: user._id });
      await Promise.all(
        apps.map(async (app) => {
          await Log.create({
            appId: app._id,
            event: 'login_failed',
            description: `Panel login failed for ${id}`,
            ip: clientIp,
          });
          await Event.create({
            userId: null,
            appId: app._id,
            type: 'login_failed',
            description: `Panel login failed for ${id}`,
            ip: clientIp,
            isTemporary: true,
            expiresAt: new Date(Date.now() + 300 * 1000),
          });
          if (app.webhookUrl) {
            await notifyPanelLoginFailed(app.webhookUrl, {
              username: id,
              ip: normalizeIp(clientIp),
              reason: 'Invalid credentials',
              appName: app.name,
              appId: app._id,
            });
          }
        })
      );
      return unauthorized(res, 'Invalid credentials');
    }

    if (user.isBanned) {
      const apps = isManagerLogin
        ? await Application.find({ _id: { $in: user.appIds || [] } })
        : await Application.find({ ownerId: user._id });
      await Promise.all(
        apps.map(async (app) => {
          await Log.create({
            appId: app._id,
            event: 'login_failed',
            description: `Panel login blocked for banned account ${id}`,
            ip: clientIp,
          });
          if (app.webhookUrl) {
            await notifyPanelLoginFailed(app.webhookUrl, {
              username: id,
              ip: normalizeIp(clientIp),
              reason: user.banReason || 'Account banned',
              appName: app.name,
              appId: app._id,
            });
          }
        })
      );
      return unauthorized(res, `Account is banned: ${user.banReason || 'Contact support'}`);
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id, user.role || (user.isManager ? 'manager' : undefined));
    const apps = user.isManager
      ? await Application.find({ _id: { $in: user.appIds || [] } })
      : await Application.find({ ownerId: user._id });

    // Detectar re-login: si lastLogin existía antes de este save, es un re-login
    const isReLogin = Boolean(user._doc?.lastLogin || user.lastLogin);

    await Promise.all(
      apps.map(async (app) => {
        await Log.create({
          appId: app._id,
          event: 'login_success',
          description: `Panel login: ${user.username}`,
          ip: clientIp,
        });
        await Event.create({
          userId: user._id,
          appId: app._id,
          type: 'login_success',
          description: `Panel login: ${user.username}`,
          ip: clientIp,
          isTemporary: true,
          expiresAt: new Date(Date.now() + 300 * 1000),
        });
        if (app.webhookUrl) {
          await notifyPanelLogin(app.webhookUrl, {
            username: user.username,
            ip: normalizeIp(clientIp),
            appName: app.name,
            appId: app._id,
            isFirstLogin: !isReLogin,
          });
        }
      })
    );

    const userResponse = user.toJSON ? user.toJSON() : user;
    userResponse.role = user.role || (user.isManager ? 'manager' : userResponse.role);
    userResponse.isManager = Boolean(user.isManager);
    userResponse.permissions = userResponse.permissions || {
      createUsers: false,
      createLicenses: false,
      manageVariables: false,
      viewLogs: false,
      viewStats: false,
    };
    userResponse.appIds = userResponse.appIds || [];
    userResponse.allowedSubscriptions = userResponse.allowedSubscriptions || [];

    return success(res, { token, user: userResponse }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return serverError(res, 'Login failed');
  }
};

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      // Allow expired tokens for refresh
      decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    } catch (err) {
      return unauthorized(res, 'Invalid token');
    }

    let user = await User.findById(decoded.id);
    if (!user) {
      user = await Manager.findById(decoded.id);
      if (!user) {
        return unauthorized(res, 'User not found');
      }
      user.isManager = true;
      user.role = 'manager';
    }

    if (user.isBanned) {
      return unauthorized(res, `Account is banned: ${user.banReason || 'No reason provided'}`);
    }

    const newToken = signToken(user._id, user.role);
    return success(res, { token: newToken }, 'Token refreshed');
  } catch (err) {
    console.error('Refresh token error:', err);
    return serverError(res, 'Token refresh failed');
  }
};

/**
 * POST /api/auth/forgot-password
 * Generate a password reset token
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return badRequest(res, 'Email is required');
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success to prevent email enumeration
    if (!user) {
      return success(res, null, 'If that email exists, a reset link has been sent');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    // In production, send email here. For now, return token in dev mode.
    const responseData =
      process.env.NODE_ENV === 'development' ? { resetToken } : null;

    return success(res, responseData, 'If that email exists, a reset link has been sent');
  } catch (err) {
    console.error('Forgot password error:', err);
    return serverError(res, 'Password reset request failed');
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
const getMe = async (req, res) => {
  try {
    // Return user with permissions included and ensure manager role flags are present
    const userData = req.user.toJSON ? req.user.toJSON() : req.user;
    const responseData = {
      ...userData,
      role: userData.role || (req.user.isManager ? 'manager' : userData.role),
      isManager: Boolean(req.user.isManager),
      premiumTrialExpiresAt: userData.premiumTrialExpiresAt || null,
      permissions: userData.permissions || {
        createUsers: false,
        createLicenses: false,
        manageVariables: false,
        viewLogs: false,
        viewStats: false,
      },
      appIds: userData.appIds || [],
      allowedSubscriptions: userData.allowedSubscriptions || [],
    };
    return success(res, responseData, 'User retrieved');
  } catch (err) {
    return serverError(res, 'Failed to retrieve user');
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  forgotPassword,
  getMe,
};
