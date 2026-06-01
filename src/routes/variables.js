const express = require('express');
const router = express.Router();
const {
  createVariable,
  getVariables,
  getVariable,
  getVariableByName,
  updateVariable,
  deleteVariable,
} = require('../controllers/variableController');
const { authenticate } = require('../middleware/auth');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// SDK-facing route: get variable by name using app credentials
router.get('/name/:name', sdkLimiter, validateApp, getVariableByName);

// Dashboard routes (require JWT)
router.use(authenticate);

// GET /api/variables
router.get('/', getVariables);

// POST /api/variables
router.post('/', createVariable);

// GET /api/variables/:id
router.get('/:id', getVariable);

// PUT /api/variables/:id
router.put('/:id', updateVariable);

// DELETE /api/variables/:id
router.delete('/:id', deleteVariable);

module.exports = router;
