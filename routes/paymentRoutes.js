const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { createPaymentSchema } = require('../validators/paymentValidator');

// Public webhook (must be before /:orderId to avoid capture)
router.post('/notification', paymentsController.notification);

router.post(
  '/:orderId/create',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  validate(createPaymentSchema),
  paymentsController.createPayment
);

router.get(
  '/:orderId',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  paymentsController.getPayment
);

module.exports = router;
