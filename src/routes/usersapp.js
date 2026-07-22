const express = require('express');
const router = express.Router();
const { register, login, activate } = require('../controllers/usersAppController');
const validateApp = require('../middleware/validateApp');

// All routes require x-app-id and x-app-secret headers
router.use(validateApp);

// POST /api/usersapp/register - Register new user (no license required)
router.post('/register', register);

// POST /api/usersapp/login - Login with username/password
router.post('/login', login);

// POST /api/usersapp/activate - Activate/create user with license
router.post('/activate', activate);

module.exports = router;
