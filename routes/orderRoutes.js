const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

router.post(
  '/',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  ordersController.createOrder
);

router.get(
  '/',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  ordersController.getOrders
);

router.get(
  '/:id',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  ordersController.getOrderById
);

router.post(
  '/:id/cancel',
  verifyToken,
  authorizeRoles('Customer', 'Admin', 'SuperAdmin'),
  ordersController.cancelOrder
);

module.exports = router;
