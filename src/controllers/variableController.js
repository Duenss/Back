const Variable = require('../models/Variable');
const Application = require('../models/Application');
const Log = require('../models/Log');
const { findAuthorizedApp } = require('../utils/appAuthorization');
const {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  serverError,
} = require('../utils/apiResponse');

/**
 * POST /api/variables
 * Create a new variable
 */
const createVariable = async (req, res) => {
  try {
    const { appId, name, value, isSecret } = req.body;

    if (!appId || !name || value === undefined) {
      return badRequest(res, 'appId, name, and value are required');
    }

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const existing = await Variable.findOne({ name, appId: app._id });
    if (existing) return conflict(res, `Variable "${name}" already exists`);

    const variable = await Variable.create({
      name,
      value,
      appId: app._id,
      isSecret: isSecret || false,
    });

    await Log.create({
      appId: app._id,
      event: 'variable_created',
      description: `Variable "${name}" created`,
      ip: req.ip,
    });

    return created(res, variable, 'Variable created');
  } catch (err) {
    console.error('createVariable error:', err);
    if (err.code === 11000) return conflict(res, 'Variable name already exists');
    return serverError(res, 'Failed to create variable');
  }
};

/**
 * GET /api/variables
 * Get all variables for an application
 */
const getVariables = async (req, res) => {
  try {
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const variables = await Variable.find({ appId: app._id }).sort({ name: 1 });

    return success(res, variables);
  } catch (err) {
    console.error('getVariables error:', err);
    return serverError(res, 'Failed to retrieve variables');
  }
};

/**
 * GET /api/variables/:id
 * Get a single variable by ID
 */
const getVariable = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const variable = await Variable.findOne({ _id: id, appId: app._id });
    if (!variable) return notFound(res, 'Variable not found');

    return success(res, variable);
  } catch (err) {
    console.error('getVariable error:', err);
    return serverError(res, 'Failed to retrieve variable');
  }
};

/**
 * GET /api/variables/name/:name
 * Get a variable by name (used by SDK)
 */
const getVariableByName = async (req, res) => {
  try {
    const { name } = req.params;
    const app = req.application; // set by validateApp middleware

    const variable = await Variable.findOne({ name, appId: app._id });
    if (!variable) return notFound(res, 'Variable not found');

    return success(res, { name: variable.name, value: variable.value });
  } catch (err) {
    console.error('getVariableByName error:', err);
    return serverError(res, 'Failed to retrieve variable');
  }
};

/**
 * PUT /api/variables/:id
 * Update a variable
 */
const updateVariable = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId, value, isSecret } = req.body;

    if (!appId) return badRequest(res, 'appId is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const variable = await Variable.findOne({ _id: id, appId: app._id });
    if (!variable) return notFound(res, 'Variable not found');

    if (value !== undefined) variable.value = value;
    if (isSecret !== undefined) variable.isSecret = isSecret;
    await variable.save();

    await Log.create({
      appId: app._id,
      event: 'variable_updated',
      description: `Variable "${variable.name}" updated`,
      ip: req.ip,
    });

    return success(res, variable, 'Variable updated');
  } catch (err) {
    console.error('updateVariable error:', err);
    return serverError(res, 'Failed to update variable');
  }
};

/**
 * DELETE /api/variables/:id
 * Delete a variable
 */
const deleteVariable = async (req, res) => {
  try {
    const { id } = req.params;
    const { appId } = req.query;

    if (!appId) return badRequest(res, 'appId query parameter is required');

    const app = await findAuthorizedApp(req.user, appId);
    if (!app) return notFound(res, 'Application not found');

    const variable = await Variable.findOneAndDelete({ _id: id, appId: app._id });
    if (!variable) return notFound(res, 'Variable not found');

    await Log.create({
      appId: app._id,
      event: 'variable_deleted',
      description: `Variable "${variable.name}" deleted`,
      ip: req.ip,
    });

    return success(res, null, 'Variable deleted');
  } catch (err) {
    console.error('deleteVariable error:', err);
    return serverError(res, 'Failed to delete variable');
  }
};

module.exports = {
  createVariable,
  getVariables,
  getVariable,
  getVariableByName,
  updateVariable,
  deleteVariable,
};
