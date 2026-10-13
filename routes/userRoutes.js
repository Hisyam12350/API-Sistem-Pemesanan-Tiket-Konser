const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Semua rute di bawah ini membutuhkan login (verifyToken)
router.use(verifyToken);

// GET /api/users (Ambil semua user - SuperAdmin & Admin)
router.get('/', authorizeRoles('SuperAdmin', 'Admin'), userController.getAllUsers);

// GET /api/users/:id (Ambil detail user berdasarkan ID - SuperAdmin & Admin)
router.get('/:id', authorizeRoles('SuperAdmin', 'Admin'), userController.getUserById);

// PUT /api/users/:id (Update data user - SuperAdmin & Admin)
router.put('/:id', authorizeRoles('SuperAdmin', 'Admin', 'Customer'), userController.updateUser);

// DELETE /api/users/:id (Hapus user - khusus SuperAdmin)
router.delete('/:id', authorizeRoles('SuperAdmin'), userController.deleteUser);

module.exports = router;
