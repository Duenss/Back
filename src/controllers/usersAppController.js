const AppUser = require('../models/AppUser');
const License = require('../models/License');
const Log = require('../models/Log');
const Event = require('../models/Event');
const { processHWID } = require('../utils/hwidGenerator');
const { notifyLogin, notifyLoginFailed, notifyLicenseActivated } = require('../utils/discordWebhook');
const {
  success,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/usersapp/register
 * Registrar un nuevo usuario de aplicación (sin licencia)
 * Headers: x-app-id, x-app-secret
 * Body: { username, password, hwid? }
 */
const register = async (req, res) => {
  try {
    const app = req.application; // Set by validateApp middleware
    const { username, password, hwid } = req.body;
    const clientIp = req.ip;

    if (!username || !password) {
      return badRequest(res, 'Username and password are required');
    }

    if (username.length < 3) {
      return badRequest(res, 'Username must be at least 3 characters');
    }

    if (password.length < 1) {
      return badRequest(res, 'Password is required');
    }

    // Check if username already exists in this app
    const existingUser = await AppUser.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }, 
      appId: app._id 
    });
    if (existingUser) {
      return conflict(res, 'Username already exists in this application');
    }

    const hashedHwid = hwid ? processHWID(hwid) : null;

    // Create user
    const user = await AppUser.create({
      username,
      password,
      appId: app._id,
      hwid: hashedHwid,
      ip: clientIp,
      status: 'active',
    });

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'user_registered',
      description: `User ${username} registered via SDK`,
      ip: clientIp,
    });

    await Event.create({
      appId: app._id,
      userId: user._id,
      type: 'user_registered',
      description: `User ${username} registered via SDK`,
      ip: clientIp,
      isTemporary: true,
      expiresAt: new Date(Date.now() + 300 * 1000),
    });

    const userResponse = user.toJSON ? user.toJSON() : user;

    return created(res, { 
      user: userResponse,
    }, 'User registered successfully');
  } catch (err) {
    console.error('usersApp register error:', err);
    if (err.code === 11000) {
      return conflict(res, 'Username already exists');
    }
    return serverError(res, 'Registration failed');
  }
};

/**
 * POST /api/usersapp/login
 * Login de usuario de aplicación con username y password
 * Headers: x-app-id, x-app-secret
 * Body: { username, password, hwid? }
 */
const login = async (req, res) => {
  try {
    const app = req.application; // Set by validateApp middleware
    const { username, password, hwid } = req.body;
    const clientIp = req.ip;

    if (!username || !password) {
      return badRequest(res, 'Username and password are required');
    }

    // Find user (case-insensitive username)
    const escapedUsername = username.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const user = await AppUser.findOne({
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') },
      appId: app._id,
    }).select('+password');

    if (!user) {
      await Log.create({
        appId: app._id,
        event: 'login_failed',
        description: `Login failed for ${username} - user not found`,
        ip: clientIp,
      });
      return unauthorized(res, 'Invalid credentials');
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await Log.create({
        appId: app._id,
        event: 'login_failed',
        description: `Login failed for ${username} - invalid password`,
        ip: clientIp,
      });

      if (app.webhookUrl) {
        await notifyLoginFailed(app.webhookUrl, {
          username,
          ip: clientIp,
          appName: app.name,
          reason: 'Invalid credentials',
        });
      }

      return unauthorized(res, 'Invalid credentials');
    }

    // Check if banned
    if (user.status === 'banned') {
      await Log.create({
        appId: app._id,
        event: 'login_blocked',
        description: `Login blocked for banned user ${username}`,
        ip: clientIp,
      });
      return forbidden(res, `User is banned: ${user.banReason || 'Contact support'}`);
    }

    // Check if expired
    if (user.expiresAt && new Date() > user.expiresAt) {
      await Log.create({
        appId: app._id,
        event: 'login_blocked',
        description: `Login blocked for expired user ${username}`,
        ip: clientIp,
      });
      return forbidden(res, 'User account has expired');
    }

    const hashedHwid = hwid ? processHWID(hwid) : null;

    // HWID check
    if (app.hwidLock && hashedHwid) {
      if (user.hwid && user.hwid !== hashedHwid) {
        await Log.create({
          appId: app._id,
          event: 'hwid_mismatch',
          description: `HWID mismatch for ${username}`,
          ip: clientIp,
        });
        return forbidden(res, 'HWID mismatch');
      }
      if (!user.hwid) {
        user.hwid = hashedHwid;
      }
    }

    // Update last login
    user.lastLogin = new Date();
    user.ip = clientIp;
    if (hashedHwid && !user.hwid) {
      user.hwid = hashedHwid;
    }
    await user.save({ validateBeforeSave: false });

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'login_success',
      description: `User login: ${username}`,
      ip: clientIp,
    });

    await Event.create({
      appId: app._id,
      userId: user._id,
      type: 'login_success',
      description: `User login: ${username}`,
      ip: clientIp,
      isTemporary: true,
      expiresAt: new Date(Date.now() + 300 * 1000),
    });

    if (app.webhookUrl) {
      await notifyLogin(app.webhookUrl, {
        username,
        ip: clientIp,
        appName: app.name,
      });
    }

    const userResponse = user.toJSON ? user.toJSON() : user;

    return success(res, {
      user: userResponse,
    }, 'Login successful');
  } catch (err) {
    console.error('usersApp login error:', err);
    return serverError(res, 'Login failed');
  }
};

/**
 * POST /api/usersapp/activate
 * Activar usuario con licencia (vincular licencia a usuario existente o crear nuevo)
 * Headers: x-app-id, x-app-secret
 * Body: { username, password, licenseKey, hwid? }
 */
const activate = async (req, res) => {
  try {
    const app = req.application; // Set by validateApp middleware
    const { username, password, licenseKey, hwid } = req.body;
    const clientIp = req.ip;

    if (!username || !password || !licenseKey) {
      return badRequest(res, 'Username, password, and licenseKey are required');
    }

    // Find license
    const license = await License.findOne({
      keyNormalized: licenseKey.toUpperCase(),
      appId: app._id,
    }).populate('subscription');

    if (!license) {
      return notFound(res, 'License key not found');
    }

    if (license.status === 'banned') {
      return forbidden(res, 'License key is banned');
    }

    // Check if user already exists
    const escapedUsername = username.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    let user = await AppUser.findOne({
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') },
      appId: app._id,
    }).select('+password');

    const hashedHwid = hwid ? processHWID(hwid) : null;

    if (user) {
      // User exists - verify password and link license
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return unauthorized(res, 'Invalid credentials');
      }

      if (user.status === 'banned') {
        return forbidden(res, `User is banned: ${user.banReason || 'Contact support'}`);
      }

      // Link license to user
      if (license.status === 'unused') {
        const expiresAt = license.durationUnit === 'lifetime'
          ? null
          : License.calculateExpiry(license.duration, license.durationUnit);

        user.subscription = license.subscription ? license.subscription._id : null;
        user.expiresAt = expiresAt;
        user.licenseKey = license.key;
        if (hashedHwid && !user.hwid) {
          user.hwid = hashedHwid;
        }
        user.ip = clientIp;
        user.lastLogin = new Date();
        await user.save();

        // Activate license
        license.status = 'active';
        license.usedBy = user._id;
        license.usedAt = new Date();
        license.expiresAt = expiresAt;
        license.hwid = hashedHwid;
        await license.save();
      } else if (license.usedBy && license.usedBy.toString() !== user._id.toString()) {
        return conflict(res, 'License already used by another user');
      }
    } else {
      // Create new user with license
      if (license.status !== 'unused') {
        return conflict(res, 'License already in use');
      }

      const expiresAt = license.durationUnit === 'lifetime'
        ? null
        : License.calculateExpiry(license.duration, license.durationUnit);

      user = await AppUser.create({
        username,
        password,
        appId: app._id,
        subscription: license.subscription ? license.subscription._id : null,
        expiresAt,
        hwid: hashedHwid,
        ip: clientIp,
        licenseKey: license.key,
        status: 'active',
      });

      // Activate license
      license.status = 'active';
      license.usedBy = user._id;
      license.usedAt = new Date();
      license.expiresAt = expiresAt;
      license.hwid = hashedHwid;
      await license.save();
    }

    await Log.create({
      appId: app._id,
      userId: user._id,
      event: 'license_activated',
      description: `License ${licenseKey} activated for ${username}`,
      ip: clientIp,
    });

    await Event.create({
      appId: app._id,
      userId: user._id,
      type: 'license_activated',
      description: `License ${licenseKey} activated for ${username}`,
      ip: clientIp,
      isTemporary: true,
      expiresAt: new Date(Date.now() + 300 * 1000),
    });

    if (app.webhookUrl) {
      await notifyLicenseActivated(app.webhookUrl, {
        licenseKey,
        username,
        ip: clientIp,
        appName: app.name,
        appId: app._id,
      });
    }

    const userResponse = user.toJSON ? user.toJSON() : user;

    return success(res, {
      user: userResponse,
      license: {
        key: license.key,
        status: license.status,
        expiresAt: license.expiresAt,
        durationUnit: license.durationUnit,
        subscription: license.subscription,
      },
    }, 'Activation successful');
  } catch (err) {
    console.error('usersApp activate error:', err);
    if (err.code === 11000) {
      return conflict(res, 'Username already exists');
    }
    return serverError(res, 'Activation failed');
  }
};

module.exports = {
  register,
  login,
  activate,
};
