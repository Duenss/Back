const License = require('../models/License');
const Application = require('../models/Application');
const AppUser = require('../models/AppUser');
const Subscription = require('../models/Subscription');
const Log = require('../models/Log');
const { generateLicenseKeys } = require('../utils/licenseGenerator');
const { processHWID } = require('../utils/hwidGenerator');
const { notifyLicenseActivated, notifyLicenseGenerated, notifyHWIDError } = require('../utils/discordWebhook');
const {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/licenses/generate
 * Generate one or more license keys
 */
const generateLicenses = async (req, res) => {
  try {
    const { appId, count = 1, mask = 'XXXX-XXXX-XXXX-XXXX', subscriptionId, duration, durationUnit, note } = req.body;

    if (!appId) return badRequest(res, 'appId is required');
    if (count < 1 || count > 1000) return badRequest(res, 'Count must be between 1 and 1000');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    // Limite para usuarios normales
    if (req.user.role === 'user' || req.user.role === 'manager') {
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
      resolvedDuration = subscription.duration;
      resolvedUnit = subscription.durationUnit;
    }

    if (!resolvedUnit) return badRequest(res, 'durationUnit is required (or provide a subscriptionId)');

    // Get existing keys to avoid duplicates
    const existingKeys = await License.find({ appId: app._id }).distinct('key');
    const keys = generateLicenseKeys(count, mask, existingKeys);

    const licenses = keys.map((key) => ({
      key,
      appId: app._id,
      subscription: subscription ? subscription._id : null,
      duration: resolvedDuration || null,
      durationUnit: resolvedUnit,
      note: note || '',
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
      notifyLicenseGenerated(app.webhookUrl, { count, mask, appName: app.name });
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

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const filter = { appId: app._id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [licenses, total] = await Promise.all([
      License.find(filter)
        .populate('subscription', 'name level')
        .populate('usedBy', 'username')
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

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
    if (!app) return notFound(res, 'Application not found');

    const license = await License.findOneAndDelete({ key: key.toUpperCase(), appId: app._id });
    if (!license) return notFound(res, 'License not found');

    return success(res, null, 'License deleted');
  } catch (err) {
    console.error('deleteLicense error:', err);
    return serverError(res, 'Failed to delete license');
  }
};

/**
 * DELETE /api/licenses/bulk/all
 */
const deleteAllLicenses = async (req, res) => {
  try {
    const { appId } = req.body;
    if (!appId) return badRequest(res, 'appId is required');

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
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

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
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

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
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

    const app = await Application.findOne({ _id: appId, ownerId: req.user._id });
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
 */
const loginWithLicense = async (req, res) => {
  try {
    const { licenseKey, hwid, username, password } = req.body;
    const app = req.application; // set by validateApp middleware
    const clientIp = req.ip;

    if (!licenseKey) return badRequest(res, 'licenseKey is required');

    const license = await License.findOne({
      key: licenseKey.toUpperCase(),
      appId: app._id,
    }).populate('subscription');

    if (!license) {
      await Log.create({ appId: app._id, event: 'login_failed', description: `Invalid license key attempt`, ip: clientIp });
      return notFound(res, 'License key not found');
    }

    if (license.status === 'banned') {
      await Log.create({ appId: app._id, event: 'login_failed', description: `Banned license key used: ${licenseKey}`, ip: clientIp });
      return forbidden(res, 'This license key has been banned');
    }

    if (license.status === 'unused') {
      return badRequest(res, 'License key has not been activated yet');
    }

    // Check expiry
    if (license.durationUnit !== 'lifetime' && license.expiresAt && new Date() > license.expiresAt) {
      license.status = 'expired';
      await license.save();
      return forbidden(res, 'License key has expired');
    }

    // HWID check
    if (app.hwidLock && hwid) {
      const hashedHwid = processHWID(hwid);
      if (license.hwid && license.hwid !== hashedHwid) {
        await Log.create({ appId: app._id, event: 'hwid_error', description: `HWID mismatch for license ${licenseKey}`, ip: clientIp });
        if (app.webhookUrl) notifyHWIDError(app.webhookUrl, { username: licenseKey, ip: clientIp, appName: app.name });
        return forbidden(res, 'HWID mismatch');
      }
    }

    const appUser = await AppUser.findById(license.usedBy);
    if (appUser) {
      if (appUser.status === 'banned') {
        return forbidden(res, `User is banned: ${appUser.banReason || 'Contact support'}`);
      }
      appUser.lastLogin = new Date();
      appUser.ip = clientIp;
      await appUser.save();
    }

    await Log.create({
      appId: app._id,
      userId: appUser ? appUser._id : null,
      event: 'login_success',
      description: `License login: ${licenseKey}`,
      ip: clientIp,
    });

    if (app.webhookUrl) {
      notifyLogin(app.webhookUrl, { username: licenseKey, ip: clientIp, appName: app.name });
    }

    return success(res, {
      valid: true,
      license: {
        key: license.key,
        status: license.status,
        expiresAt: license.expiresAt,
        durationUnit: license.durationUnit,
        subscription: license.subscription,
      },
      user: appUser || null,
    }, 'Authentication successful');
  } catch (err) {
    console.error('loginWithLicense error:', err);
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
      key: licenseKey.toUpperCase(),
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
      key: licenseKey.toUpperCase(),
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
 */
const authWithKey = async (req, res) => {
  try {
    const { licenseKey, hwid } = req.body;
    const app = req.application;
    const clientIp = req.ip;

    if (!licenseKey) return badRequest(res, 'licenseKey is required');

    const license = await License.findOne({
      key: licenseKey.toUpperCase(),
      appId: app._id,
    }).populate('subscription');

    if (!license) {
      await Log.create({ appId: app._id, event: 'login_failed', description: `Invalid license key: ${licenseKey}`, ip: clientIp });
      return notFound(res, 'License key not found');
    }

    if (license.status === 'banned') {
      await Log.create({ appId: app._id, event: 'login_failed', description: `Banned license: ${licenseKey}`, ip: clientIp });
      return forbidden(res, 'This license key has been banned');
    }

    if (license.status === 'expired') {
      return forbidden(res, 'License key has expired');
    }

    const hashedHwid = hwid ? processHWID(hwid) : null;

    // ── Activacion automatica si esta sin usar ────────────────
    if (license.status === 'unused') {
      // Usar los primeros 20 chars de la licencia como username (cumple min 3 / max 30)
      const autoUsername = licenseKey.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 20);
      // Password = hash del HWID o de la licencia si no hay HWID
      const autoPassword = hwid ? hwid.substring(0, 30) : licenseKey.substring(0, 30);

      // Verificar que no exista ya un usuario con ese username en esta app
      let appUser = await AppUser.findOne({ username: autoUsername, appId: app._id });

      if (!appUser) {
        const expiresAt = license.durationUnit === 'lifetime'
          ? null
          : License.calculateExpiry(license.duration, license.durationUnit);

        appUser = await AppUser.create({
          username: autoUsername,
          password: autoPassword,
          appId: app._id,
          subscription: license.subscription ? license.subscription._id : null,
          expiresAt,
          hwid: hashedHwid,
          ip: clientIp,
          licenseKey: license.key,
        });

        license.status   = 'active';
        license.usedBy   = appUser._id;
        license.usedAt   = new Date();
        license.expiresAt = appUser.expiresAt;
        license.hwid     = hashedHwid;
        await license.save();

        await Log.create({
          appId: app._id,
          userId: appUser._id,
          event: 'license_activated',
          description: `Auto-activated license ${licenseKey}`,
          ip: clientIp,
        });

        if (app.webhookUrl) {
          notifyLicenseActivated(app.webhookUrl, { licenseKey, username: autoUsername, ip: clientIp, appName: app.name });
        }
      }
    }

    // ── Login ─────────────────────────────────────────────────
    // Verificar expiry
    if (license.durationUnit !== 'lifetime' && license.expiresAt && new Date() > license.expiresAt) {
      license.status = 'expired';
      await license.save();
      return forbidden(res, 'License key has expired');
    }

    // HWID check
    if (app.hwidLock && hashedHwid && license.hwid && license.hwid !== hashedHwid) {
      await Log.create({ appId: app._id, event: 'hwid_error', description: `HWID mismatch: ${licenseKey}`, ip: clientIp });
      if (app.webhookUrl) notifyHWIDError(app.webhookUrl, { username: licenseKey, ip: clientIp, appName: app.name });
      return forbidden(res, 'HWID mismatch');
    }

    const appUser = await AppUser.findById(license.usedBy);
    if (appUser) {
      if (appUser.status === 'banned') {
        return forbidden(res, `User is banned: ${appUser.banReason || 'Contact support'}`);
      }
      appUser.lastLogin = new Date();
      appUser.ip = clientIp;
      await appUser.save();
    }

    await Log.create({
      appId: app._id,
      userId: appUser ? appUser._id : null,
      event: 'login_success',
      description: `Key login: ${licenseKey}`,
      ip: clientIp,
    });

    return success(res, {
      valid: true,
      license: {
        key: license.key,
        status: license.status,
        expiresAt: license.expiresAt,
        durationUnit: license.durationUnit,
        subscription: license.subscription,
      },
      user: appUser || null,
    }, 'Authentication successful');

  } catch (err) {
    console.error('authWithKey error:', err);
    if (err.code === 11000) return conflict(res, 'Username conflict, try again');
    return serverError(res, 'Authentication failed');
  }
};

module.exports = {
  generateLicenses,
  getLicenses,
  deleteLicense,
  deleteAllLicenses,
  deleteUsedLicenses,
  deleteUnusedLicenses,
  deleteExpiredLicenses,
  loginWithLicense,
  checkLicense,
  activateLicense,
  authWithKey,
};
