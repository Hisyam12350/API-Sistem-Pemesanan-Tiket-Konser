const Payment = require('../models/payments.js');
const Order = require('../models/orders.js');
const userModel = require('../models/userModel.js');
const { createTransaction, getTransactionStatus, verifySignature, mapStatus } = require('../utils/midtransService.js');
const { logger } = require('../utils/logger.js');

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

const paymentsController = {
  createPayment: async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const result = await Order.getOrderById(orderId, req.user.id, req.user.role);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
      }
      const { order, items } = result;
      if (order.status_order !== 'pending') {
        return res.status(409).json({ success: false, message: 'Hanya order pending yang dapat dibayar.' });
      }
      if (new Date(order.batas_waktu_bayar) <= new Date()) {
        return res.status(409).json({ success: false, message: 'Order telah kadaluwarsa.' });
      }

      // existing pending payment
      const existing = await Payment.findPendingByOrderId(orderId);
      if (existing && existing.snap_token) {
        return res.status(200).json({
          success: true,
          message: 'Transaksi pembayaran sudah ada.',
          data: {
            snap_token: existing.snap_token,
            redirect_url: existing.redirect_url,
            order_id: orderId,
            payment_id: existing.id,
            midtrans_order_id: existing.transaction_id
          }
        });
      }

      const user = await userModel.findUserById(req.user.id);

      // category names
      const catNames = {};
      // fetch via pg? use supabase not imported; use pool directly via Payment? We'll query ticket_categories via Order? Add quick query
      const pool = require('../config/db.js');
      for (const item of items) {
        if (!catNames[item.kategori_id]) {
          const r = await pool.query('SELECT nama_kategori FROM ticket_categories WHERE id = $1', [item.kategori_id]);
          catNames[item.kategori_id] = r.rows[0] ? r.rows[0].nama_kategori : `Kategori ${item.kategori_id}`;
        }
      }

      const midtransOrderId = `ORDER-${orderId}-${Date.now()}`;
      const grossAmount = Number(order.total_pembayaran);

      const itemDetails = items.map((it) => ({
        id: `CAT-${it.kategori_id}`,
        price: Number(it.harga_satuan),
        quantity: it.jumlah,
        name: catNames[it.kategori_id]
      }));

      const payload = {
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: grossAmount
        },
        item_details: itemDetails,
        customer_details: {
          first_name: user ? user.username : 'Customer',
          email: user ? user.email : req.user.email
        }
      };

      const snap = await createTransaction(payload);

      const payment = await Payment.createPayment({
        order_id: orderId,
        transaction_id: midtransOrderId,
        payment_method: 'midtrans_snap',
        amount: grossAmount,
        status: 'pending',
        snap_token: snap.token,
        redirect_url: snap.redirect_url,
        midtrans_order_id: midtransOrderId
      });

      return res.status(201).json({
        success: true,
        message: 'Transaksi pembayaran berhasil dibuat.',
        data: {
          snap_token: snap.token,
          redirect_url: snap.redirect_url,
          order_id: orderId,
          payment_id: payment.id,
          midtrans_order_id: midtransOrderId
        }
      });
    } catch (error) {
      mapError(error, res);
    }
  },

  notification: async (req, res) => {
    try {
      const body = req.body || {};
      const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
      const { order_id, status_code, gross_amount, signature_key, transaction_status } = body;

      logger.info('[MIDTRANS_WEBHOOK] body:', JSON.stringify(body));
      logger.info('[MIDTRANS_WEBHOOK] serverKey present:', Boolean(serverKey), 'isProduction:', process.env.MIDTRANS_IS_PRODUCTION === 'true');

      let isValid = verifySignature({ order_id, status_code, gross_amount, signature_key });

      if (!isValid) {
        logger.info('[MIDTRANS_WEBHOOK] Signature lokal mismatch, memverifikasi langsung ke Midtrans API...');
        try {
          const midtransData = await getTransactionStatus(order_id);
          if (
            midtransData &&
            midtransData.order_id === order_id &&
            Number(midtransData.gross_amount) === Number(gross_amount)
          ) {
            logger.info('[MIDTRANS_WEBHOOK] Verifikasi via Midtrans API BERHASIL:', {
              transaction_status: midtransData.transaction_status,
              status_code: midtransData.status_code
            });
            isValid = true;
          }
        } catch (apiErr) {
          logger.error('[MIDTRANS_WEBHOOK] Verifikasi Midtrans API gagal:', apiErr.message);
        }
      }

      if (!isValid) {
        const computed = require('crypto')
          .createHash('sha512')
          .update(String(order_id) + String(status_code) + String(gross_amount) + serverKey)
          .digest('hex');
        logger.info('[MIDTRANS_WEBHOOK] signature invalid:', { order_id, status_code, gross_amount, signature_key, computed });
        return res.status(403).json({ success: false, message: 'Signature tidak valid.' });
      }

      const payment = await Payment.findByTransactionId(order_id);
      if (!payment) {
        logger.info('[MIDTRANS_WEBHOOK] payment not found for order_id:', order_id);
        return res.status(404).json({ success: false, message: 'Payment tidak ditemukan.' });
      }

      logger.info('[MIDTRANS_WEBHOOK] payment found:', { paymentId: payment.id, orderId: payment.order_id, status: payment.status, amount: payment.amount });

      const { order } = await Payment.getOrderWithItems(payment.order_id);
      if (!order) {
        logger.info('[MIDTRANS_WEBHOOK] order not found for paymentId:', payment.id);
        return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
      }

      logger.info('[MIDTRANS_WEBHOOK] order:', { orderId: order.id, status_order: order.status_order, total_pembayaran: order.total_pembayaran, batas_waktu_bayar: order.batas_waktu_bayar, gross_amount });

      if (Number(gross_amount) !== Number(order.total_pembayaran)) {
        logger.info('[MIDTRANS_WEBHOOK] amount mismatch:', { gross_amount, total_pembayaran: order.total_pembayaran });
        return res.status(400).json({ success: false, message: 'Gross amount tidak sesuai.' });
      }

      const newStatus = mapStatus(transaction_status);
      logger.info('[MIDTRANS_WEBHOOK] mapped status:', { transaction_status, newStatus });

      // idempotent success
      if (payment.status === 'success' && order.status_order === 'paid') {
        return res.status(200).json({ success: true, message: 'Sudah diproses.' });
      }

      if (newStatus === 'success') {
        if (order.status_order !== 'paid') {
          const pool = require('../config/db.js');
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query("UPDATE orders SET status_order='paid' WHERE id = $1", [order.id]);
            await client.query(
              `UPDATE seats SET status_kursi='booked', locked_until=NULL, locked_by=NULL
               FROM order_item_seats ois
               JOIN order_items oi ON oi.id = ois.order_item_id
               WHERE ois.seat_id = seats.id AND oi.order_id = $1`,
              [order.id]
            );
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          } finally {
            client.release();
          }
          await Payment.generateTickets(order.id);
        }
        await Payment.updatePayment(payment.id, { status: 'success' });
      } else if (newStatus === 'pending') {
        await Payment.updatePayment(payment.id, { status: 'pending' });
      } else {
        // expired/failed/cancelled
        if (order.status_order === 'pending') {
          const target = newStatus === 'expired' ? 'expired' : 'cancelled';
          await (require('../config/db.js')).query("UPDATE orders SET status_order=$1 WHERE id = $2", [target, order.id]);
        }
        const payStatus = newStatus === 'expired' ? 'expired' : (newStatus === 'failed' ? 'failed' : (newStatus === 'cancelled' ? 'cancelled' : newStatus));
        let ps = payStatus;
        if (ps === 'cancelled') ps = 'failed';
        await Payment.updatePayment(payment.id, { status: ps });
      }

      return res.status(200).json({ success: true, message: 'Notifikasi diproses.' });
    } catch (error) {
      logger.error('[MIDTRANS_WEBHOOK] error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  getPayment: async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const result = await Order.getOrderById(orderId, req.user.id, req.user.role);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
      }
      let payments = await Payment.findByOrderId(orderId);

      // Auto-sync dengan Midtrans jika status masih pending
      if (result.order.status_order === 'pending') {
        const pendingPayment = payments.find(p => p.status === 'pending' && p.transaction_id);
        if (pendingPayment) {
          try {
            const midtransData = await getTransactionStatus(pendingPayment.transaction_id);
            const newStatus = mapStatus(midtransData.transaction_status);
            if (newStatus === 'success') {
              const pool = require('../config/db.js');
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                await client.query("UPDATE orders SET status_order='paid' WHERE id = $1", [result.order.id]);
                await client.query(
                  `UPDATE seats SET status_kursi='booked', locked_until=NULL, locked_by=NULL
                   FROM order_item_seats ois
                   JOIN order_items oi ON oi.id = ois.order_item_id
                   WHERE ois.seat_id = seats.id AND oi.order_id = $1`,
                  [result.order.id]
                );
                await client.query('COMMIT');
              } catch (e) {
                await client.query('ROLLBACK');
                throw e;
              } finally {
                client.release();
              }
              await Payment.generateTickets(result.order.id);
              await Payment.updatePayment(pendingPayment.id, { status: 'success' });
              result.order.status_order = 'paid';
              pendingPayment.status = 'success';
            }
          } catch (syncErr) {
            logger.info('[GET_PAYMENT_SYNC] Midtrans check skipped/error:', syncErr.message);
          }
        }
      }

      const tickets = await Payment.getTicketsByOrderId(orderId);
      return res.status(200).json({
        success: true,
        message: 'Status pembayaran.',
        data: { order: result.order, items: result.items, payments, tickets }
      });
    } catch (error) {
      mapError(error, res);
    }
  }
};

module.exports = paymentsController;
