const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Application = require('../models/Application');
const Log = require('../models/Log');
const { notifyLogin, notifyLoginFailed } = require('../utils/discordWebhook');
const { success, created, badRequest, unauthorized, conflict, serverError } = require('../utils/apiResponse');

/**
 * Generate a signed JWT for a user
 */
const signToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * POST /api/auth/register
 * Register a new admin account
 */
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return badRequest(res, 'Username, email, and password are required');
    }

    if (password.length < 8) {
      return badRequest(res, 'Password must be at least 8 characters');
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return conflict(res, 'Username or email already in use');
    }

    const user = await User.create({
      username,
      email,
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
    const user = await User.findOne(query).select('+password');

    if (!user) {
      return unauthorized(res, 'Invalid credentials');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const apps = await Application.find({ ownerId: user._id });
      await Promise.all(
        apps.map(async (app) => {
          await Log.create({
            appId: app._id,
            event: 'login_failed',
            description: `Panel login failed for ${id}`,
            ip: clientIp,
          });
          if (app.webhookUrl) {
            await notifyLoginFailed(app.webhookUrl, {
              username: id,
              ip: clientIp,
              reason: 'Invalid credentials',
              appName: app.name,
            });
          }
        })
      );
      return unauthorized(res, 'Invalid credentials');
    }

    if (user.isBanned) {
      const apps = await Application.find({ ownerId: user._id });
      await Promise.all(
        apps.map(async (app) => {
          await Log.create({
            appId: app._id,
            event: 'login_failed',
            description: `Panel login blocked for banned account ${id}`,
            ip: clientIp,
          });
          if (app.webhookUrl) {
            await notifyLoginFailed(app.webhookUrl, {
              username: id,
              ip: clientIp,
              reason: user.banReason || 'Account banned',
              appName: app.name,
            });
          }
        })
      );
      return unauthorized(res, `Account is banned: ${user.banReason || 'Contact support'}`);
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id, user.role);
    const apps = await Application.find({ ownerId: user._id });
    await Promise.all(
      apps.map(async (app) => {
        await Log.create({
          appId: app._id,
          event: 'login_success',
          description: `Panel login: ${user.username}`,
          ip: clientIp,
        });
        if (app.webhookUrl) {
          await notifyLogin(app.webhookUrl, {
            username: user.username,
            ip: clientIp,
            appName: app.name,
          });
        }
      })
    );

    return success(res, { token, user }, 'Login successful');
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

    const user = await User.findById(decoded.id);
    if (!user) {
      return unauthorized(res, 'User not found');
    }

    if (user.isBanned) {
      return unauthorized(res, 'Account is banned');
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
    return success(res, req.user, 'User retrieved');
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
