const License = require('../models/License');
const Application = require('../models/Application');
const AppUser = require('../models/AppUser');
const Subscription = require('../models/Subscription');
const Log = require('../models/Log');
const Event = require('../models/Event');
const { findAuthorizedApp } = require('../utils/appAuthorization');
const { generateLicenseKeys } = require('../utils/licenseGenerator');
const { processHWID } = require('../utils/hwidGenerator');
const { notifyLicenseActivated, notifyLicenseGenerated, notifyHWIDError, notifyLogin, notifyLoginFailed } = require('../utils/discordWebhook');
const {
  success,
  created,
  badRequest,
  unauthorized,
  notFound,
  forbidden,
  conflict,
  serverError,
} = require('../utils/apiResponse');

const createAuthError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * POST /api/licenses/claim-free
 * SDK endpoint: generate a single free license using the app name as prefix.
 * Requires validateApp middleware (x-app-id + x-app-secret).
 */
const claimFreeLicense = async (req, res) => {
  try {
    const app = req.application;
    const clientIp = req.ip;

    const slug = (app.name || 'app').replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'app';
    const mask = `${slug}-XXXX-XXXX`;

    // Avoid duplicates
    const existingKeys = await License.find({ appId: app._id }).distinct('key');
    const keys = generateLicenseKeys(1, mask, existingKeys, { uppercase: false, lowercase: true, numbers: true });
    const key = keys[0];

    const licenseDoc = await License.create({
      key,
      keyNormalized: key.toUpperCase(),
      appId: app._id,
      subscription: null,
      duration: null,
      durationUnit: 'lifetime',
      note: 'Claimed via BotHub',
      createdBy: null,
    });

    await Log.create({ appId: app._id, event: 'license_generated', description: `Claim-free license generated: ${key}`, ip: clientIp });

    if (app.webhookUrl) {
      notifyLicenseGenerated(app.webhookUrl, { count: 1, createdBy: 'BotHub', appName: app.name, appId: app._id });
    }

    return created(res, { key: licenseDoc.key }, 'License generated');
  } catch (err) {
    console.error('claimFreeLicense error:', err);
    return serverError(res, 'Failed to claim license');
  }
};

const authenticateKeyAuth = async ({
  app,
  clientIp,
  username,
  password,
  licenseKey,
  hwid,
  requiredSubscription,
}) => {
  let justActivated = false;
  const hasUserCreds = Boolean(username || password);

  if (hasUserCreds) {
    if (!username || !password) {
      throw createAuthError(400, 'username and password are required');
    }
  } else if (!licenseKey) {
    throw createAuthError(400, 'licenseKey is required');
  }

  let appUser = null;
  if (hasUserCreds) {
    const escapedUsername = username.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    appUser = await AppUser.findOne({
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') },
      appId: app._id,
    }).select('+password').populate('subscription');

    if (!appUser || !(await appUser.comparePassword(password))) {
      throw createAuthError(401, 'Invalid credentials');
    }

    if (appUser.status === 'banned') {
      throw createAuthError(403, `User is banned: ${appUser.banReason || 'Contact support'}`);
    }
  }

  const licenseQuery = licenseKey
    ? { keyNormalized: licenseKey.toUpperCase(), appId: app._id }
    : appUser
      ? {
          $or: [
            { usedBy: appUser._id },
            ...(appUser.licenseKey ? [{ keyNormalized: appUser.licenseKey.toUpperCase() }] : []),
          ],
          appId: app._id,
        }
      : null;

  let license = null;
  if (licenseQuery) {
    license = await License.findOne(licenseQuery).populate('subscription');
  }

  if (!license && !appUser) {
    throw createAuthError(404, 'License key or user not found');
  }

  const hashedHwid = hwid ? processHWID(hwid) : null;

  if (license) {
    if (requiredSubscription) {
      const licenseSub = license.subscription ? license.subscription.name : null;
      if (!licenseSub || licenseSub.toLowerCase() !== requiredSubscription.toLowerCase()) {
        throw createAuthError(403, 'Invalid key');
      }
    }

    if (license.status === 'banned') {
      throw createAuthError(403, 'This license key has been banned');
    }

    if (license.status === 'unused') {
      justActivated = true;
      const expiresAt = license.durationUnit === 'lifetime'
        ? null
        : License.calculateExpiry(license.duration, license.durationUnit);

      if (appUser) {
        appUser.subscription = license.subscription ? license.subscription._id : null;
        appUser.expiresAt = expiresAt;
        appUser.hwid = hashedHwid;
        appUser.ip = clientIp;
        appUser.licenseKey = license.key;
        appUser.lastLogin = new Date();
        await appUser.save();
      }

      license.status = 'active';
      license.usedBy = appUser ? appUser._id : license.usedBy;
      license.usedAt = new Date();
      license.expiresAt = expiresAt;
      license.hwid = hashedHwid;
      await license.save();
    }

    if (license.durationUnit !== 'lifetime' && license.expiresAt && new Date() > license.expiresAt) {
      license.status = 'expired';
      await license.save();
      throw createAuthError(403, 'License key has expired');
    }

    if (app.hwidLock && hashedHwid) {
      if (license.hwid && license.hwid !== hashedHwid) {
        throw createAuthError(403, 'HWID mismatch');
      }
      if (!license.hwid) {
        license.hwid = hashedHwid;
        await license.save();
      }
    }

    if (!appUser) {
      appUser = await AppUser.findById(license.usedBy);
    }
  }

  if (appUser) {
    if (appUser.status === 'banned') {
      throw createAuthError(403, `User is banned: ${appUser.banReason || 'Contact support'}`);
    }

    if (appUser.expiresAt && new Date() > appUser.expiresAt) {
      throw createAuthError(403, 'User account has expired');
    }

    if (app.hwidLock && hashedHwid) {
      if (appUser.hwid && appUser.hwid !== hashedHwid) {
        throw createAuthError(403, 'HWID mismatch');
      }
      if (!appUser.hwid) {
        appUser.hwid = hashedHwid;
      }
    }

    appUser.lastLogin = new Date();
    appUser.ip = clientIp;
    if (license) {
      appUser.licenseKey = license.key;
      if (!appUser.subscription && license.subscription) {
        appUser.subscription = license.subscription._id;
      }
      if (!appUser.expiresAt && license.expiresAt) {
        appUser.expiresAt = license.expiresAt;
      }
    }
    if (hashedHwid && !appUser.hwid) {
      appUser.hwid = hashedHwid;
    }
    await appUser.save();
  }

  return { appUser, license, justActivated };
};

/**
 * POST /api/licenses/generate
 * Generate one or more license keys
 */
const generateLicenses = async (req, res) => {
  try {
    const {
      appId,
      count: rawCount,
      quantity,
      mask = '****-****-****-****',
      subscriptionId,
      duration,
      durationUnit,
      useUppercase = true,
      useLowercase = false,
      note,
    } = req.body;

    const count = parseInt(rawCount ?? quantity ?? 1, 10);
    if (Number.isNaN(count) || count < 1 || count > 1000) return badRequest(res, 'Count must be between 1 and 1000');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    // Limite para usuarios normales y managers cuyos owners no tienen plan premium
    // Los managers heredan el plan de su owner (superadmin/admin = ilimitado)
    const ownerRole = req.user.isManager ? (req.user.ownerRole || 'user') : req.user.role;
    const isUnlimited = ownerRole === 'superadmin' || ownerRole === 'admin';

    if (!isUnlimited) {
      if (count > 10) return forbidden(res, 'Free plan limit: maximum 10 licenses per generation');
      const total = await License.countDocuments({ appId: app._id });
      if (total + count > 10) return forbidden(res, `Free plan limit: maximum 10 total licenses per application (currently ${total})`);
    }

    let subscription = null;
    let resolvedDuration = duration;
    let resolvedUnit = durationUnit;

    if (subscriptionId) {
      subscription = await Subscription.findOne({ _id: subscriptionId, appId: app._id });
      if (!subscription) return notFound(res, 'Subscription not found');
      if (req.user.isManager && Array.isArray(req.user.allowedSubscriptions) && req.user.allowedSubscriptions.length > 0) {
        const allowed = req.user.allowedSubscriptions.some((id) => id.toString() === subscription._id.toString());
        if (!allowed) return forbidden(res, 'Subscription not allowed for this manager');
      }
    }

    if (!resolvedUnit) return badRequest(res, 'durationUnit is required');

    // Get existing keys to avoid duplicates
    const existingKeys = await License.find({ appId: app._id }).distinct('key');
    const keys = generateLicenseKeys(count, mask, existingKeys, {
      uppercase: useUppercase,
      lowercase: useLowercase,
      numbers: true,
    });

    const licenses = keys.map((key) => ({
      key,
      keyNormalized: key.toUpperCase(),
      appId: app._id,
      subscription: subscription ? subscription._id : null,
      duration: resolvedDuration || null,
      durationUnit: resolvedUnit,
      note: note || '',
      createdBy: req.user._id || req.user.id || null,
    }));

    const created_licenses = await License.insertMany(licenses);

    await Log.create({
      appId: app._id,
      event: 'license_generated',
      description: `${count} license(s) generated with mask "${mask}"`,
      ip: req.ip,
      metadata: { count, mask },
    });

    if (app.webhookUrl) {
      notifyLicenseGenerated(app.webhookUrl, {
        count,
        createdBy: req.user.username || req.user.email || 'Unknown',
        appName: app.name,
        appId: app._id,
      });
    }

    return created(res, created_licenses, `${count} license(s) generated`);
  } catch (err) {
    console.error('generateLicenses error:', err);
    return serverError(res, 'Failed to generate licenses');
  }
};

/**
 * GET /api/licenses
 * Get all licenses for an application
 */
const getLicenses = async (req, res) => {
  try {
    const { appId, status, page = 1, limit = 50 } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const filter = { appId: app._id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [licenses, total] = await Promise.all([
      License.find(filter)
        .populate('subscription', 'name level')
        .populate('usedBy', 'username')
        .populate('createdBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      License.countDocuments(filter),
    ]);

    return success(res, {
      licenses,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('getLicenses error:', err);
    return serverError(res, 'Failed to retrieve licenses');
  }
};

/**
 * DELETE /api/licenses/:key
 * Delete a single license by key
 */
const deleteLicense = async (req, res) => {
  try {
    const { key } = req.params;
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const license = await License.findOneAndDelete({ keyNormalized: key.toUpperCase(), appId: app._id });
    if (!license) return notFound(res, 'License not found');

    return success(res, null, 'License deleted');
  } catch (err) {
    console.error('deleteLicense error:', err);
    return serverError(res, 'Failed to delete license');
  }
};

/**
 * POST /api/licenses/:key/reset-hwid
 */
const resetLicenseHwid = async (req, res) => {
  try {
    const { key } = req.params;
    const { appId } = req.query;
    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const license = await License.findOne({ keyNormalized: key.toUpperCase(), appId: app._id });
    if (!license) return notFound(res, 'License not found');

    license.hwid = null;
    await license.save();

    return success(res, null, 'HWID reset successfully');
  } catch (err) {
    console.error('resetLicenseHwid error:', err);
    return serverError(res, 'Failed to reset HWID');
  }
};

/**
 * POST /api/licenses/:key/pause
 */
const pauseLicense = async (req, res) => {
  try {
    const { key } = req.params;
    const { appId } = req.query;
    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const license = await License.findOne({ keyNormalized: key.toUpperCase(), appId: app._id });
    if (!license) return notFound(res, 'License not found');
    if (license.status === 'banned') return badRequest(res, 'Cannot pause a banned license');
    if (license.status === 'expired') return badRequest(res, 'License is already paused/expired');

    license.status = 'expired';
    await license.save();

    return success(res, null, 'License paused successfully');
  } catch (err) {
    console.error('pauseLicense error:', err);
    return serverError(res, 'Failed to pause license');
  }
};

/**
 * POST /api/licenses/:key/ban
 */
const banLicense = async (req, res) => {
  try {
    const { key } = req.params;
    const { appId } = req.query;
    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const license = await License.findOne({ keyNormalized: key.toUpperCase(), appId: app._id });
    if (!license) return notFound(res, 'License not found');
    if (license.status === 'banned') return badRequest(res, 'License is already banned');

    license.status = 'banned';
    await license.save();

    return success(res, null, 'License banned successfully');
  } catch (err) {
    console.error('banLicense error:', err);
    return serverError(res, 'Failed to ban license');
  }
};

/**
 * DELETE /api/licenses/bulk/all
 */
const deleteAllLicenses = async (req, res) => {
  try {
    const { appId } = req.body;
    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const result = await License.deleteMany({ appId: app._id });
    return success(res, { deleted: result.deletedCount }, 'All licenses deleted');
  } catch (err) {
    return serverError(res, 'Failed to delete licenses');
  }
};

/**
 * DELETE /api/licenses/bulk/used
 */
const deleteUsedLicenses = async (req, res) => {
  try {
    const { appId } = req.body;
    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const result = await License.deleteMany({ appId: app._id, status: 'active' });
    return success(res, { deleted: result.deletedCount }, 'Used licenses deleted');
  } catch (err) {
    return serverError(res, 'Failed to delete used licenses');
  }
};

/**
 * DELETE /api/licenses/bulk/unused
 */
const deleteUnusedLicenses = async (req, res) => {
  try {
    const { appId } = req.body;
    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const result = await License.deleteMany({ appId: app._id, status: 'unused' });
    return success(res, { deleted: result.deletedCount }, 'Unused licenses deleted');
  } catch (err) {
    return serverError(res, 'Failed to delete unused licenses');
  }
};

/**
 * DELETE /api/licenses/bulk/expired
 */
const deleteExpiredLicenses = async (req, res) => {
  try {
    const { appId } = req.body;
    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const result = await License.deleteMany({ appId: app._id, status: 'expired' });
    return success(res, { deleted: result.deletedCount }, 'Expired licenses deleted');
  } catch (err) {
    return serverError(res, 'Failed to delete expired licenses');
  }
};

/**
 * POST /api/licenses/login
 * Authenticate an app user using a license key (SDK endpoint)
 * Requires x-app-id and x-app-secret headers (handled by validateApp middleware)
 *
 * Body opcional: requiredSubscription (string) — si se envía, la licencia DEBE
 * tener asignada esa suscripción (comparación case-insensitive). Si no coincide
 * se devuelve 403 "Invalid key".
 */
const loginWithLicense = async (req, res) => {
  try {
    const { licenseKey, hwid, username, password, requiredSubscription } = req.body;
    const app = req.application; // set by validateApp middleware
    const clientIp = req.ip;

    const authResult = await authenticateKeyAuth({
      app,
      clientIp,
      username,
      password,
      licenseKey,
      hwid,
      requiredSubscription,
    });

    await Log.create({
      appId: app._id,
      userId: authResult.appUser ? authResult.appUser._id : null,
      event: 'login_success',
      description: authResult.appUser
        ? `KeyAuth login: ${authResult.appUser.username}`
        : `License login: ${licenseKey}`,
      ip: clientIp,
    });
    await Event.create({
      appId: app._id,
      userId: authResult.appUser ? authResult.appUser._id : null,
      type: 'login_success',
      description: authResult.appUser
        ? `KeyAuth login: ${authResult.appUser.username}`
        : `License login: ${licenseKey}`,
      ip: clientIp,
      isTemporary: true,
      expiresAt: new Date(Date.now() + 300 * 1000),
    });

    if (app.webhookUrl) {
      notifyLogin(app.webhookUrl, {
        username: authResult.appUser ? authResult.appUser.username : licenseKey,
        ip: clientIp,
        appName: app.name,
      });
      if (authResult.justActivated) {
        notifyLicenseActivated(app.webhookUrl, {
          licenseKey,
          username: authResult.appUser ? authResult.appUser.username : licenseKey,
          ip: clientIp,
          appName: app.name,
          appId: app._id,
        });
      }
    }

    if (app.webhookUrl) {
      notifyLogin(app.webhookUrl, {
        username: authResult.appUser ? authResult.appUser.username : licenseKey,
        ip: clientIp,
        appName: app.name,
      });
      if (authResult.justActivated) {
        notifyLicenseActivated(app.webhookUrl, {
          licenseKey,
          username: authResult.appUser ? authResult.appUser.username : licenseKey,
          ip: clientIp,
          appName: app.name,
          appId: app._id,
        });
      }
    }

    return success(res, {
      valid: true,
      license: authResult.license ? {
        key: authResult.license.key,
        status: authResult.license.status,
        expiresAt: authResult.license.expiresAt,
        durationUnit: authResult.license.durationUnit,
        subscription: authResult.license.subscription,
      } : null,
      user: authResult.appUser || null,
    }, 'Authentication successful');
  } catch (err) {
    console.error('loginWithLicense error:', err);

    if (err.statusCode === 401) return unauthorized(res, err.message);
    if (err.statusCode === 403) return forbidden(res, err.message);
    if (err.statusCode === 404) return notFound(res, err.message);
    if (err.statusCode === 400) return badRequest(res, err.message);

    return serverError(res, 'Authentication failed');
  }
};

/**
 * POST /api/licenses/check
 * Check if a license key is valid without logging in
 */
const checkLicense = async (req, res) => {
  try {
    const { licenseKey } = req.body;
    const app = req.application;

    if (!licenseKey) return badRequest(res, 'licenseKey is required');

    const license = await License.findOne({
      keyNormalized: licenseKey.toUpperCase(),
      appId: app._id,
    }).populate('subscription', 'name level');

    if (!license) return notFound(res, 'License key not found');

    const isExpired =
      license.durationUnit !== 'lifetime' &&
      license.expiresAt &&
      new Date() > license.expiresAt;

    return success(res, {
      valid: license.status === 'active' && !isExpired,
      status: isExpired ? 'expired' : license.status,
      expiresAt: license.expiresAt,
      subscription: license.subscription,
    });
  } catch (err) {
    console.error('checkLicense error:', err);
    return serverError(res, 'License check failed');
  }
};

/**
 * POST /api/licenses/activate
 * Activate an unused license key and bind it to a user
 */
const activateLicense = async (req, res) => {
  try {
    const { licenseKey, username, password, hwid } = req.body;
    const app = req.application;
    const clientIp = req.ip;

    if (!licenseKey || !username || !password) {
      return badRequest(res, 'licenseKey, username, and password are required');
    }

    const license = await License.findOne({
      keyNormalized: licenseKey.toUpperCase(),
      appId: app._id,
    }).populate('subscription');

    if (!license) return notFound(res, 'License key not found');
    if (license.status === 'banned') return forbidden(res, 'License key is banned');
    if (license.status !== 'unused') return conflict(res, 'License key is already in use');

    // Check if username already exists in this app
    const existingUser = await AppUser.findOne({ username, appId: app._id });
    if (existingUser) return conflict(res, 'Username already taken in this application');

    // Calculate expiry
    const expiresAt = license.durationUnit === 'lifetime'
      ? null
      : License.calculateExpiry(license.duration, license.durationUnit);

    const hashedHwid = hwid ? processHWID(hwid) : null;

    // Create app user
    const appUser = await AppUser.create({
      username,
      password,
      appId: app._id,
      subscription: license.subscription ? license.subscription._id : null,
      expiresAt,
      hwid: hashedHwid,
      ip: clientIp,
      licenseKey: license.key,
    });

    // Activate license
    license.status = 'active';
    license.usedBy = appUser._id;
    license.usedAt = new Date();
    license.expiresAt = expiresAt;
    license.hwid = hashedHwid;
    await license.save();

    await Log.create({
      appId: app._id,
      userId: appUser._id,
      event: 'license_activated',
      description: `License ${licenseKey} activated by ${username}`,
      ip: clientIp,
    });
    await Event.create({ appId: app._id, userId: appUser._id, type: 'license_activated', description: `License ${licenseKey} activated by ${username}`, ip: clientIp, isTemporary: true, expiresAt: new Date(Date.now() + 300 * 1000) });

    if (app.webhookUrl) {
      notifyLicenseActivated(app.webhookUrl, { licenseKey, username, ip: clientIp, appName: app.name });
    }

    return created(res, {
      user: appUser,
      license: { key: license.key, expiresAt: license.expiresAt, status: license.status },
    }, 'License activated successfully');
  } catch (err) {
    console.error('activateLicense error:', err);
    if (err.code === 11000) return conflict(res, 'Username already taken');
    return serverError(res, 'License activation failed');
  }
};

/**
 * POST /api/licenses/auth
 * SDK endpoint: autenticar con solo licencia + HWID.
 * Si la licencia esta unused la activa automaticamente (sin username/password).
 * Si ya esta activa hace login directo.
 *
 * Body opcional: requiredSubscription (string) — si se envía, la licencia DEBE
 * tener asignada esa suscripción (comparación case-insensitive). Si no coincide
 * se devuelve 403 "Invalid key".
 */
const authWithKey = async (req, res) => {
  try {
    const { licenseKey, hwid, username, password, requiredSubscription } = req.body;
    const app = req.application;
    const clientIp = req.ip;

    const authResult = await authenticateKeyAuth({
      app,
      clientIp,
      username,
      password,
      licenseKey,
      hwid,
      requiredSubscription,
    });

    await Log.create({
      appId: app._id,
      userId: authResult.appUser ? authResult.appUser._id : null,
      event: 'login_success',
      description: authResult.appUser
        ? `KeyAuth login: ${authResult.appUser.username}`
        : `License login: ${licenseKey}`,
      ip: clientIp,
    });
    await Event.create({
      appId: app._id,
      userId: authResult.appUser ? authResult.appUser._id : null,
      type: 'login_success',
      description: authResult.appUser
        ? `KeyAuth login: ${authResult.appUser.username}`
        : `License login: ${licenseKey}`,
      ip: clientIp,
      isTemporary: true,
      expiresAt: new Date(Date.now() + 300 * 1000),
    });

    return success(res, {
      valid: true,
      license: authResult.license ? {
        key: authResult.license.key,
        status: authResult.license.status,
        expiresAt: authResult.license.expiresAt,
        durationUnit: authResult.license.durationUnit,
        subscription: authResult.license.subscription,
      } : null,
      user: authResult.appUser || null,
    }, 'Authentication successful');
  } catch (err) {
    console.error('authWithKey error:', err);
    if (err.statusCode === 401) return unauthorized(res, err.message);
    if (err.statusCode === 403) return forbidden(res, err.message);
    if (err.statusCode === 404) return notFound(res, err.message);
    if (err.statusCode === 400) return badRequest(res, err.message);
    if (err.code === 11000) return conflict(res, 'Username conflict, try again');
    return serverError(res, 'Authentication failed');
  }
};

module.exports = {
  generateLicenses,
  getLicenses,
  deleteLicense,
  resetLicenseHwid,
  pauseLicense,
  banLicense,
  deleteAllLicenses,
  deleteUsedLicenses,
  deleteUnusedLicenses,
  deleteExpiredLicenses,
  loginWithLicense,
  checkLicense,
  activateLicense,
  authWithKey,
  claimFreeLicense,
};
