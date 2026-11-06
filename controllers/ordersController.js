const Order = require('../models/orders.js');

function mapError(error, res) {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (error && error.code) {
    if (['P0001', '23505', '23503'].includes(error.code)) {
      return res.status(409).json({ success: false, message: error.message || 'Konflik data.' });
    }
  }
  return res.status(500).json({ success: false, error: error.message });
}

const ordersController = {
  createOrder: async (req, res) => {
    try {
      const { seat_ids } = req.body;
      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }

      const result = await Order.createOrder({ customer_id: req.user.id, seat_ids });
      res.status(201).json({ success: true, message: 'Order berhasil dibuat.', data: result });
    } catch (error) {
      mapError(error, res);
    }
  },

  getOrders: async (req, res) => {
    try {
      const orders = await Order.getOrders(req.user.id, req.user.role);
      res.status(200).json({ success: true, message: 'Daftar order.', data: orders });
    } catch (error) {
      mapError(error, res);
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
      mapError(error, res);
    }
  },

  cancelOrder: async (req, res) => {
    try {
      const result = await Order.cancelOrder(req.params.id, req.user.id, req.user.role);
      res.status(200).json({ success: true, message: 'Order berhasil dibatalkan.', data: result });
    } catch (error) {
      mapError(error, res);
    }
  },

  payOrder: async (req, res) => {
    try {
      const result = await Order.payOrder(req.params.id, req.user.id, req.user.role);
      res.status(200).json({ success: true, message: 'Order berhasil dibayar.', data: result });
    } catch (error) {
      mapError(error, res);
    }
  }
};

module.exports = ordersController;
