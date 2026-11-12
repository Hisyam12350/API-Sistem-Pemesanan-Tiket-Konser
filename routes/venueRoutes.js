const express = require('express');
const router = express.Router();
const venuesController = require('../controllers/venuesController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { createVenueSchema, updateVenueSchema } = require('../validators/venueValidator');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Daftar tempat dengan filter kategori + search + pagination (Publik - dipakai Step 1)
router.get('/', venuesController.getVenues);

// Cek detail sebelum memilih (Publik - dipakai Step 1)
router.get('/:id', venuesController.getVenueById);

// Admin kelola venue manual (+ upload gambar via field 'gambar')
router.post('/', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), upload.single('gambar'), uploadLimiter, validate(createVenueSchema), venuesController.createVenue);
router.put('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), upload.single('gambar'), uploadLimiter, validate(updateVenueSchema), venuesController.updateVenue);
router.delete('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venuesController.deleteVenue);

module.exports = router;
