const express = require('express');
const router = express.Router();
const {
  createManager,
  getManagers,
  updateManager,
  deleteManager,
} = require('../controllers/managerController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);
router.use(requireAdmin);

// GET /api/managers
router.get('/', getManagers);

// POST /api/managers
router.post('/', createManager);

// PUT /api/managers/:id
router.put('/:id', updateManager);

// DELETE /api/managers/:id
router.delete('/:id', deleteManager);

module.exports = router;
