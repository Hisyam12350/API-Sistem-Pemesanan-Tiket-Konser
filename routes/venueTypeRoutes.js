const express = require('express');
const router = express.Router();
const venueTypeController = require('../controllers/venueTypesController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { z } = require('zod');

const createVenueTypeSchema = z.object({
  nama_tipe: z.string().min(1, 'Nama tipe wajib diisi').max(100, 'Nama tipe maksimal 100 karakter')
});

// Daftar tipe tempat (Publik - dipakai Step 1)
router.get('/', venueTypeController.getAllTypes);

// Admin & SuperAdmin kelola master tipe tempat
router.post('/', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), validate(createVenueTypeSchema), venueTypeController.createType);
router.delete('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venueTypeController.deleteType);

module.exports = router;
