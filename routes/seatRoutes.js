const express = require('express');
const router = express.Router();
const seatsController = require('../controllers/seatsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Lihat kursi per kategori (Publik / Customer bisa akses)
// GET /api/seats?kategori_id=
router.get('/', seatsController.getSeats);

// Admin & SuperAdmin dapat generate kursi massal untuk satu kategori
router.post(
  '/generate',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  seatsController.generateSeats
);

// Customer (dan Admin) dapat mengunci kursi sementara saat akan checkout
router.post(
  '/lock',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  seatsController.lockSeats
);

// Customer (dan Admin) dapat membuka lock kursi
router.post(
  '/unlock',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  seatsController.unlockSeats
);

module.exports = router;
