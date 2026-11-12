const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// GET /api/tickets/:id - Lihat detail tiket + QR code SVG (embed)
// Perlu auth: user harus login, role Customer/Admin/SuperAdmin
router.get('/:id', verifyToken, ticketController.getTicketById);

// GET /api/tickets/:id/download - Download QR code sebagai file PNG
// Perlu auth: user harus login, role Customer/Admin/SuperAdmin
router.get('/:id/download', verifyToken, ticketController.downloadTicketQR);

// GET /api/tickets - List tiket user ini
// Perlu auth: user harus login
router.get('/', verifyToken, ticketController.getTicketsByUser);

module.exports = router;