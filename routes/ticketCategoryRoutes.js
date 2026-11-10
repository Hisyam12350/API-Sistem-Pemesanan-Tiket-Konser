const express = require('express');
const router = express.Router();
const ticketCategoryController = require('../controllers/ticketCategoriesController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { createTicketCategorySchema, updateTicketCategorySchema } = require('../validators/ticketCategoryValidator');

// Get all categories (bisa filter ?event_id=) & Get by ID (Publik / Customer)
router.get('/', ticketCategoryController.getAllCategories);
router.get('/:id', ticketCategoryController.getCategoryById);

// Admin & SuperAdmin dapat membuat, mengedit, dan menghapus kategori tiket
router.post(
  '/',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(createTicketCategorySchema),
  ticketCategoryController.createCategory
);

router.put(
  '/:id',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  validate(updateTicketCategorySchema),
  ticketCategoryController.updateCategory
);

router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('Admin', 'SuperAdmin'),
  ticketCategoryController.deleteCategory
);

module.exports = router;
