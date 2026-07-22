const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// Todos los endpoints requieren autenticacion
router.use(authenticate);

// ── Accesibles por todos los usuarios autenticados ────────────
router.get('/broadcast',             getActiveBroadcasts);
router.get('/plan-limits',           getPlanLimits);
router.get('/webhook-config/:appId', getWebhookConfig);

// ── Solo superadmin ───────────────────────────────────────────
router.post('/broadcast',            requireSuperAdmin, createBroadcast);
router.get('/broadcast/all',         requireSuperAdmin, getAllBroadcasts);
router.delete('/broadcast/:id',      requireSuperAdmin, deleteBroadcast);
router.put('/webhook-config/:appId', requireSuperAdmin, updateWebhookConfig);

// Panel user management (solo superadmin)
router.get('/users',             requireSuperAdmin, getAllUsers);
router.patch('/users/:id/role',  requireSuperAdmin, updateUserRole);
router.post('/users/:id/ban',    requireSuperAdmin, banPanelUser);
router.post('/users/:id/unban',  requireSuperAdmin, unbanPanelUser);
router.delete('/users/:id',      requireSuperAdmin, deletePanelUser);

module.exports = router;
