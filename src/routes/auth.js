const express = require('express');
const router = express.Router();
const { register, login, refreshToken, forgotPassword, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/register
router.post('/register', authLimiter, register);

// POST /api/auth/login
router.post('/login', authLimiter, login);

// POST /api/auth/refresh
router.post('/refresh', authLimiter, refreshToken);

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, forgotPassword);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

module.exports = router;
