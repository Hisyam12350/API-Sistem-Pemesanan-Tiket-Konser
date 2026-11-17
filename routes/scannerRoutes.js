const express = require('express');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const {
  checkInSchema,
  pageQuerySchema,
  eventParamSchema,
  assignmentParamsSchema,
  assignScannerSchema
} = require('../validators/scannerValidator');
const { scannerLimiter } = require('../middleware/rateLimiter');

router.get(
  '/assigned-events',
  verifyToken,
  authorizeRoles('Scanner'),
  scannerController.getAssignedEvents
);

router.post(
  '/check-in',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  scannerLimiter,
  validate(checkInSchema),
  scannerController.checkIn
);

router.get(
  '/scanned-tickets',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  validate(pageQuerySchema, 'query'),
  scannerController.getScannedTickets
);

router.get(
  '/events/:eventId/scanned',
  verifyToken,
  authorizeRoles('Scanner', 'Admin', 'SuperAdmin'),
  validate(eventParamSchema, 'params'),
  validate(pageQuerySchema, 'query'),
  scannerController.getEventScannedTickets
);

router.get(
  '/events/:eventId/assignments',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(eventParamSchema, 'params'),
  scannerController.getEventAssignments
);

router.post(
  '/events/:eventId/assignments',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(eventParamSchema, 'params'),
  validate(assignScannerSchema),
  scannerController.assignScanner
);

router.delete(
  '/events/:eventId/assignments/:scannerId',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(assignmentParamsSchema, 'params'),
  scannerController.unassignScanner
);

module.exports = router;