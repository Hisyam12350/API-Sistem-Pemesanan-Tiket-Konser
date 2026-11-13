const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { checkOwnership } = require('../middleware/ownershipMiddleware');
const { updateUserSchema } = require('../validators/userValidator');

// Semua rute di bawah ini membutuhkan login (verifyToken)
router.use(verifyToken);

// GET /api/users (Ambil semua user - SuperAdmin & Admin)
router.get('/', authorizeRoles('SuperAdmin', 'Admin'), userController.getAllUsers);

// GET /api/users/:id (Ambil detail user berdasarkan ID - SuperAdmin & Admin)
router.get('/:id', authorizeRoles('SuperAdmin', 'Admin'), userController.getUserById);

// PUT /api/users/:id - Customer can only update themselves, SuperAdmin/Admin can update anyone
router.put('/:id',
  authorizeRoles('SuperAdmin', 'Admin', 'Customer'),
  checkOwnership('id'),
  validate(updateUserSchema),
  userController.updateUser
);

// DELETE /api/users/:id (Hapus user - khusus SuperAdmin)
router.delete('/:id', authorizeRoles('SuperAdmin'), userController.deleteUser);

module.exports = router;
