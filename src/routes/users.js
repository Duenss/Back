const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  deleteUser,
  banUser,
  unbanUser,
  resetHWID,
} = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/users
router.get('/', getUsers);

// POST /api/users
router.post('/', createUser);

// DELETE /api/users/:id
router.delete('/:id', deleteUser);

// POST /api/users/:id/ban
router.post('/:id/ban', banUser);

// POST /api/users/:id/unban
router.post('/:id/unban', unbanUser);

// POST /api/users/:id/reset-hwid
router.post('/:id/reset-hwid', resetHWID);

module.exports = router;
