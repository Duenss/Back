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
const { authenticate, requirePermission, validateManagerAppAccess, managerOwnerSubscriptionInheritance } = require('../middleware/auth');
const validateApp = require('../middleware/validateApp');
const { sdkLimiter } = require('../middleware/rateLimiter');

// SDK-facing route: get variable by name using app credentials
router.get('/name/:name', sdkLimiter, validateApp, getVariableByName);

// Dashboard routes (require JWT)
router.use(authenticate);
router.use(managerOwnerSubscriptionInheritance); // Inherit owner subscription for plan limits

// GET /api/variables
router.get('/', requirePermission('manageVariables'), getVariables);

// POST /api/variables
router.post('/', requirePermission('manageVariables'), validateManagerAppAccess, createVariable);

// GET /api/variables/:id
router.get('/:id', requirePermission('manageVariables'), getVariable);

// PUT /api/variables/:id
router.put('/:id', requirePermission('manageVariables'), updateVariable);

// DELETE /api/variables/:id
router.delete('/:id', requirePermission('manageVariables'), deleteVariable);

module.exports = router;
