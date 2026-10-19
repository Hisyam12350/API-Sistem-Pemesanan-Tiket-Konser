const express = require('express');
const router = express.Router();
const venuesController = require('../controllers/venuesController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Daftar tempat dengan filter kategori + search + pagination (Publik - dipakai Step 1)
router.get('/', venuesController.getVenues);

// Cek detail sebelum memilih (Publik - dipakai Step 1)
router.get('/:id', venuesController.getVenueById);

// Proxy Google Maps: ketikan user -> saran tempat.
// 1 session_token dipakai selama 1 sesi mengetik (aturan billing Google).
// Butuh login agar API key Google tidak disalahgunakan pihak anonim.
router.post('/cari-google', verifyToken, venuesController.searchGoogle);

// Simpan venue terpilih dari Google (klasifikasi otomatis -> fallback manual 422)
router.post('/simpan-dari-google', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venuesController.saveFromGoogle);

// Admin kelola venue manual
router.post('/', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venuesController.createVenue);
router.put('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venuesController.updateVenue);
router.delete('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), venuesController.deleteVenue);

module.exports = router;
