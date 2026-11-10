const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { registerSchema, loginSchema } = require('../validators/authValidator');

// POST /api/auth/register
router.post('/register', validate(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', validate(loginSchema), authController.login);

// GET /api/auth/me (Protected route)
router.get('/me', verifyToken, authController.getProfile);

module.exports = router;
