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
} = require('../controllers/adminController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// Todos los endpoints requieren autenticacion
router.use(authenticate);

// ── Accesibles por todos los usuarios autenticados ────────────
router.get('/broadcast',          getActiveBroadcasts); // ver notificaciones activas
router.get('/plan-limits',        getPlanLimits);        // ver limites del plan propio
router.get('/webhook-config/:appId', getWebhookConfig); // ver config webhook (readonly para no-superadmin)

// ── Solo superadmin ───────────────────────────────────────────
router.post('/broadcast',            requireSuperAdmin, createBroadcast);
router.get('/broadcast/all',         requireSuperAdmin, getAllBroadcasts);
router.delete('/broadcast/:id',      requireSuperAdmin, deleteBroadcast);
router.put('/webhook-config/:appId', requireSuperAdmin, updateWebhookConfig);
router.get('/users',                 requireSuperAdmin, getAllUsers);

module.exports = router;
