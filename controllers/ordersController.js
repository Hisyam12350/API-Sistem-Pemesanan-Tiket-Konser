const Order = require('../models/orders.js');
const Payment = require('../models/payments.js');
const { cancelTransaction } = require('../utils/midtransService.js');
const { logger } = require('../utils/logger');
const { mapError } = require('../utils/httpError.js');

const ordersController = {
  createOrder: async (req, res) => {
    try {
      const { seat_ids } = req.validated || req.body;
      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }

      const result = await Order.createOrder({ customer_id: req.user.id, seat_ids });
      res.status(201).json({ success: true, message: 'Order berhasil dibuat.', data: result });
    } catch (error) {
      mapError(error, res, 'Error on createOrder');
    }
  },

  getOrders: async (req, res) => {
    try {
      const orders = await Order.getOrders(req.user.id, req.user.role);
      res.status(200).json({ success: true, message: 'Daftar order.', data: orders });
    } catch (error) {
      mapError(error, res, 'Error on getOrders');
    }
  },

  getOrderById: async (req, res) => {
    try {
      const result = await Order.getOrderById(req.params.id, req.user.id, req.user.role);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
      }
      res.status(200).json({ success: true, message: 'Detail order.', data: result });
    } catch (error) {
      mapError(error, res, 'Error on getOrderById');
    }
  },

  cancelOrder: async (req, res) => {
    try {
      const result = await Order.cancelOrder(req.params.id, req.user.id, req.user.role);

      // Setelah order batal: tutup transaksi Midtrans yang masih menggantung supaya pembeli tidak bisa
      // membayar order yang sudah dibatalkan. Best-effort: kegagalan hanya dicatat. Jika tetap ada
      // pembayaran yang masuk, webhook menandainya sebagai 'late' (needs_refund) — tidak ada uang hilang diam-diam.
      try {
        const pending = await Payment.findPendingByOrderId(result.id);
        if (pending) {
          if (pending.transaction_id) await cancelTransaction(pending.transaction_id);
          await Payment.updatePayment(pending.id, { status: 'failed' });
        }
      } catch (e) {
        logger.warn({ orderId: result.id, err: e.message }, '[ORDER_CANCEL] gagal membatalkan transaksi Midtrans (diabaikan)');
      }

      res.status(200).json({ success: true, message: 'Order berhasil dibatalkan.', data: result });
    } catch (error) {
      mapError(error, res, 'Error on cancelOrder');
    }
  }
};

module.exports = ordersController;
