const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  deleteUser,
  banUser,
  unbanUser,
  resetHWID,
  resetPassword,
} = require('../controllers/userController');
const { authenticate, requirePermission, validateManagerAppAccess, managerOwnerSubscriptionInheritance } = require('../middleware/auth');

router.use(authenticate);
router.use(managerOwnerSubscriptionInheritance); // Inherit owner subscription for plan limits

// GET /api/users
router.get('/', requirePermission('createUsers'), getUsers);

// POST /api/users
router.post('/', requirePermission('createUsers'), validateManagerAppAccess, createUser);

// DELETE /api/users/:id
router.delete('/:id', requirePermission('createUsers'), validateManagerAppAccess, deleteUser);

// POST /api/users/:id/ban
router.post('/:id/ban', requirePermission('createUsers'), validateManagerAppAccess, banUser);

// POST /api/users/:id/unban
router.post('/:id/unban', requirePermission('createUsers'), validateManagerAppAccess, unbanUser);

// POST /api/users/:id/reset-hwid
router.post('/:id/reset-hwid', requirePermission('createUsers'), resetHWID);

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', requirePermission('createUsers'), validateManagerAppAccess, resetPassword);

module.exports = router;
