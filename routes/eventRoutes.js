const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Get all events & Get event by ID (Publik / Customer bisa akses)
router.get('/', eventController.getAllEvents);
router.get('/:id', eventController.getEventById);

// Admin & SuperAdmin dapat membuat, mengedit, dan menghapus event (dengan dukungan upload banner gambar)
router.post(
  '/',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  upload.single('banner'),
  eventController.createEvents
);

router.put(
  '/:id',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  upload.single('banner'),
  eventController.updateEvents
);

router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  eventController.deleteEvents
);

module.exports = router;
