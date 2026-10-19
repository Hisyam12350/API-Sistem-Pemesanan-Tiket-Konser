const express = require('express');
const router = express.Router();
const venueTypeController = require('../controllers/venueTypesController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Daftar tipe tempat (Publik - dipakai Step 1)
router.get('/', venueTypeController.getAllTypes);

// Admin & SuperAdmin kelola master tipe tempat
router.post('/', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venueTypeController.createType);
router.delete('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venueTypeController.deleteType);

module.exports = router;
