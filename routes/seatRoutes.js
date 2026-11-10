const express = require('express');
const router = express.Router();
const seatsController = require('../controllers/seatsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { generateSeatsSchema, lockSeatsSchema, unlockSeatsSchema } = require('../validators/seatValidator');

// Lihat kursi per kategori (Publik / Customer bisa akses)
// GET /api/seats?kategori_id=
router.get('/', seatsController.getSeats);

// Admin & SuperAdmin dapat generate kursi massal untuk satu kategori
router.post(
  '/generate',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(generateSeatsSchema),
  seatsController.generateSeats
);

// Customer (dan Admin) dapat mengunci kursi sementara saat akan checkout
router.post(
  '/lock',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  validate(lockSeatsSchema),
  seatsController.lockSeats
);

// Customer (dan Admin) dapat membuka lock kursi
router.post(
  '/unlock',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  validate(unlockSeatsSchema),
  seatsController.unlockSeats
);

module.exports = router;
