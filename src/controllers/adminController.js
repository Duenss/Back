const Broadcast = require('../models/Broadcast');
const WebhookConfig = require('../models/WebhookConfig');
const Application = require('../models/Application');
const User = require('../models/User');
const { PLAN_LIMITS } = require('../middleware/auth');
const {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
  serverError,
} = require('../utils/apiResponse');

// ── BROADCAST ─────────────────────────────────────────────────

/**
 * POST /api/admin/broadcast
 * Crear un mensaje broadcast (solo superadmin)
 */
const createBroadcast = async (req, res) => {
  try {
    const { message, type } = req.body;

    if (!message || !message.trim()) {
      return badRequest(res, 'message is required');
    }

    const broadcast = await Broadcast.create({
      message: message.trim(),
      type: type || 'info',
      sentBy: req.user._id,
    });

    return created(res, broadcast, 'Broadcast sent successfully');
  } catch (err) {
    console.error('createBroadcast error:', err);
    return serverError(res, 'Failed to create broadcast');
  }
};

/**
 * GET /api/admin/broadcast
 * Obtener broadcasts activos (todos los usuarios autenticados pueden ver)
 */
const getActiveBroadcasts = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find()
      .sort({ createdAt: -1 })
      .limit(10);

    return success(res, broadcasts, 'Broadcasts retrieved');
  } catch (err) {
    console.error('getActiveBroadcasts error:', err);
    return serverError(res, 'Failed to retrieve broadcasts');
  }
};

/**
 * GET /api/admin/broadcast/all
 * Historial completo de broadcasts (solo superadmin)
 */
const getAllBroadcasts = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find()
      .populate('sentBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(50);

    return success(res, broadcasts, 'All broadcasts retrieved');
  } catch (err) {
    console.error('getAllBroadcasts error:', err);
    return serverError(res, 'Failed to retrieve broadcasts');
  }
};

/**
 * DELETE /api/admin/broadcast/:id
 * Desactivar un broadcast (solo superadmin)
 */
const deleteBroadcast = async (req, res) => {
  try {
    const { id } = req.params;
    const broadcast = await Broadcast.findByIdAndUpdate(
      id,
      { active: false },
      { new: true }
    );

    if (!broadcast) return notFound(res, 'Broadcast not found');

    return success(res, null, 'Broadcast deactivated');
  } catch (err) {
    console.error('deleteBroadcast error:', err);
    return serverError(res, 'Failed to delete broadcast');
  }
};

// ── WEBHOOK CONFIG ────────────────────────────────────────────

/**
 * GET /api/admin/webhook-config/:appId
 * Obtener config del webhook de una app
 * superadmin: puede ver cualquier app
 * user/admin: solo sus propias apps, solo lectura
 */
const getWebhookConfig = async (req, res) => {
  try {
    const { appId } = req.params;

    const appQuery = req.user.role === 'superadmin'
      ? { _id: appId }
      : { _id: appId, ownerId: req.user._id };

    const app = await Application.findOne(appQuery);
    if (!app) return notFound(res, 'Application not found');

    let config = await WebhookConfig.findOne({ appId: app._id });

    // Si no existe, devolver defaults
    if (!config) {
      config = {
        appId: app._id,
        botName: 'AuthPlatform',
        botAvatar: null,
        color: 0x3498db,
        footerText: 'AuthPlatform',
        footerIcon: null,
        messages: {
          login_success:     '**{username}** logged in successfully.',
          login_failed:      'Failed login attempt for **{username}**.',
          license_activated: 'License **{licenseKey}** activated by **{username}**.',
          license_generated: '**{count}** license(s) generated.',
          hwid_error:        'HWID mismatch detected for **{username}**.',
          user_banned:       '**{username}** has been banned. Reason: {reason}',
        },
      };
    }

    return success(res, config, 'Webhook config retrieved');
  } catch (err) {
    console.error('getWebhookConfig error:', err);
    return serverError(res, 'Failed to retrieve webhook config');
  }
};

/**
 * PUT /api/admin/webhook-config/:appId
 * Actualizar config del webhook (solo superadmin)
 */
const updateWebhookConfig = async (req, res) => {
  try {
    const { appId } = req.params;
    const { botName, botAvatar, color, footerText, footerIcon, messages } = req.body;

    const app = await Application.findById(appId);
    if (!app) return notFound(res, 'Application not found');

    const update = {};
    if (botName    !== undefined) update.botName    = botName;
    if (botAvatar  !== undefined) update.botAvatar  = botAvatar;
    if (color      !== undefined) update.color      = color;
    if (footerText !== undefined) update.footerText = footerText;
    if (footerIcon !== undefined) update.footerIcon = footerIcon;
    if (messages   !== undefined) update.messages   = messages;

    const config = await WebhookConfig.findOneAndUpdate(
      { appId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );

    return success(res, config, 'Webhook config updated');
  } catch (err) {
    console.error('updateWebhookConfig error:', err);
    return serverError(res, 'Failed to update webhook config');
  }
};

// ── PLAN LIMITS INFO ──────────────────────────────────────────

/**
 * GET /api/admin/plan-limits
 * Devuelve los limites del plan del usuario actual
 */
const getPlanLimits = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const isAdmin      = req.user.role === 'admin';
    const unlimited    = isSuperAdmin || isAdmin;

    return success(res, {
      role: req.user.role,
      unlimited,
      limits: unlimited ? null : PLAN_LIMITS,
      canEditWebhook: isSuperAdmin,
      canBroadcast:   isSuperAdmin,
    }, 'Plan limits retrieved');
  } catch (err) {
    return serverError(res, 'Failed to retrieve plan limits');
  }
};

// ── USERS OVERVIEW (solo superadmin) ─────────────────────────

/**
 * GET /api/admin/users
 * Ver todos los usuarios de la plataforma (solo superadmin)
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email:    { $regex: search, $options: 'i' } },
    ];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -passwordResetToken -passwordResetExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    return success(res, { users, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } }, 'Users retrieved');
  } catch (err) {
    console.error('getAllUsers error:', err);
    return serverError(res, 'Failed to retrieve users');
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Cambiar el rol de un usuario (solo superadmin)
 * Roles válidos: 'user' | 'admin' | 'superadmin'
 * También acepta: premiumTrialExpiresAt para el rol trial
 */
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, premiumTrialExpiresAt } = req.body;

    const VALID_ROLES = ['user', 'admin', 'superadmin'];
    if (!role || !VALID_ROLES.includes(role)) {
      return badRequest(res, `role must be one of: ${VALID_ROLES.join(', ')}`);
    }

    // No se puede cambiar el propio rol
    if (id === req.user._id.toString()) {
      return forbidden(res, 'No puedes cambiar tu propio rol');
    }

    const user = await User.findById(id);
    if (!user) return notFound(res, 'User not found');

    user.role = role;

    // Si el rol es 'admin' con fecha de expiración, lo manejamos con un campo auxiliar
    if (role === 'admin' && premiumTrialExpiresAt) {
      user.premiumTrialExpiresAt = new Date(premiumTrialExpiresAt);
    } else {
      user.premiumTrialExpiresAt = undefined;
    }

    await user.save({ validateBeforeSave: false });

    return success(res, user, 'Role updated successfully');
  } catch (err) {
    console.error('updateUserRole error:', err);
    return serverError(res, 'Failed to update user role');
  }
};

/**
 * POST /api/admin/users/:id/ban
 * Banear un usuario del panel (solo superadmin)
 */
const banPanelUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (id === req.user._id.toString()) return forbidden(res, 'No puedes banearte a ti mismo');

    const user = await User.findById(id);
    if (!user) return notFound(res, 'User not found');

    user.isBanned  = true;
    user.banReason = reason || 'Sin razón';
    await user.save({ validateBeforeSave: false });

    return success(res, user, 'User banned');
  } catch (err) {
    return serverError(res, 'Failed to ban user');
  }
};

/**
 * POST /api/admin/users/:id/unban
 * Desbanear un usuario del panel (solo superadmin)
 */
const unbanPanelUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return notFound(res, 'User not found');

    user.isBanned  = false;
    user.banReason = null;
    await user.save({ validateBeforeSave: false });

    return success(res, user, 'User unbanned');
  } catch (err) {
    return serverError(res, 'Failed to unban user');
  }
};

/**
 * DELETE /api/admin/users/:id
 * Eliminar un usuario de la plataforma (solo superadmin)
 */
const deletePanelUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return forbidden(res, 'No puedes eliminar tu propia cuenta');
    }

    const user = await User.findById(id);
    if (!user) return notFound(res, 'User not found');

    await user.deleteOne();

    return success(res, null, 'User deleted successfully');
  } catch (err) {
    console.error('deletePanelUser error:', err);
    return serverError(res, 'Failed to delete user');
  }
};

module.exports = {
  createBroadcast,
  getActiveBroadcasts,
  getAllBroadcasts,
  deleteBroadcast,
  getWebhookConfig,
  updateWebhookConfig,
  getPlanLimits,
  getAllUsers,
  updateUserRole,
  banPanelUser,
  unbanPanelUser,
  deletePanelUser,
};
