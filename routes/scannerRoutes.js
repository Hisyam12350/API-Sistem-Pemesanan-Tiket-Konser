const express = require('express');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { checkInSchema } = require('../validators/scannerValidator');

router.post(
  '/check-in',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  validate(checkInSchema),
  scannerController.checkIn
);

router.get(
  '/scanned-tickets',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  scannerController.getScannedTickets
);

router.get(
  '/events/:eventId/scanned',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  scannerController.getEventScannedTickets
);

module.exports = router;