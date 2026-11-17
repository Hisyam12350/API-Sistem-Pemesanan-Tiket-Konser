const Payment = require('../models/payments.js');
const Order = require('../models/orders.js');
const userModel = require('../models/userModel.js');
const { createTransaction, getTransactionStatus, verifySignature, mapStatus } = require('../utils/midtransService.js');
const { logger } = require('../utils/logger.js');
const { mapError } = require('../utils/httpError.js');
const pool = require('../config/db.js');

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
      for (const item of items) {
        if (!catNames[item.kategori_id]) {
          const r = await pool.query('SELECT nama_kategori FROM ticket_categories WHERE id = $1', [item.kategori_id]);
          catNames[item.kategori_id] = r.rows[0] ? r.rows[0].nama_kategori : `Kategori ${item.kategori_id}`;
        }
      }

      // Transaksi Midtrans HARUS kedaluwarsa tidak lebih lama dari order. Tanpa ini Midtrans memakai
      // default 24 jam, sehingga pembeli bisa membayar SETELAH order expired (kursi sudah dilepas)
      // -> uang masuk tetapi tidak ada tiket.
      const remainingMs = new Date(order.batas_waktu_bayar).getTime() - Date.now();
      const expiryMinutes = Math.floor(remainingMs / 60000); // dibulatkan ke bawah: tidak pernah melewati batas order
      if (expiryMinutes < 1) {
        return res.status(409).json({ success: false, message: 'Waktu pembayaran order ini hampir/sudah habis. Silakan buat order baru.' });
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
        },
        expiry: { unit: 'minutes', duration: expiryMinutes }
      };

      const snap = await createTransaction(payload);

      let payment;
      try {
        payment = await Payment.createPayment({
          order_id: orderId,
          transaction_id: midtransOrderId,
          payment_method: 'midtrans_snap',
          amount: grossAmount,
          status: 'pending',
          snap_token: snap.token,
          redirect_url: snap.redirect_url,
          midtrans_order_id: midtransOrderId
        });
      } catch (insertErr) {
        // Dua request createPayment bersamaan: unique index parsial uq_payments_one_pending_per_order
        // hanya mengizinkan 1 pembayaran pending per order. Pemenangnya yang dipakai; transaksi
        // Midtrans milik yang kalah tidak pernah diberikan ke pembeli dan akan expired sendiri.
        if (insertErr && insertErr.code === '23505') {
          const winner = await Payment.findPendingByOrderId(orderId);
          if (winner && winner.snap_token) {
            return res.status(200).json({
              success: true,
              message: 'Transaksi pembayaran sudah ada.',
              data: {
                snap_token: winner.snap_token,
                redirect_url: winner.redirect_url,
                order_id: orderId,
                payment_id: winner.id,
                midtrans_order_id: winner.transaction_id
              }
            });
          }
        }
        throw insertErr;
      }

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
      mapError(error, res, 'Error in paymentsController');
    }
  },

  // Webhook Midtrans (publik). Prinsip keamanan:
  //  1. Signature WAJIB valid (SHA512 dengan server key). Tidak ada jalur "fallback" yang meloloskan
  //     request dengan signature salah.
  //  2. Status pembayaran TIDAK diambil dari body request. Setelah signature valid, status
  //     diverifikasi ulang ke API Midtrans dan hanya data dari API itulah yang dipercaya.
  //  3. Jumlah dibandingkan dengan total order di database.
  //  4. Perubahan order dilakukan atomik & idempoten lewat Payment.settleOrderPaid().
  notification: async (req, res) => {
    try {
      const body = req.body || {};
      const { order_id, status_code, gross_amount, signature_key } = body;

      if (!order_id || !status_code || gross_amount === undefined || !signature_key) {
        return res.status(400).json({ success: false, message: 'Payload notifikasi tidak lengkap.' });
      }

      if (!verifySignature({ order_id, status_code, gross_amount, signature_key })) {
        // Jangan pernah mencatat signature yang diharapkan / signature_key ke log.
        logger.warn({ order_id, status_code }, '[MIDTRANS_WEBHOOK] signature tidak valid, ditolak');
        return res.status(403).json({ success: false, message: 'Signature tidak valid.' });
      }

      const payment = await Payment.findByTransactionId(order_id);
      if (!payment) {
        logger.warn({ order_id }, '[MIDTRANS_WEBHOOK] payment tidak ditemukan');
        return res.status(404).json({ success: false, message: 'Payment tidak ditemukan.' });
      }

      // Sumber kebenaran status = API Midtrans, bukan body notifikasi.
      let midtransData;
      try {
        midtransData = await getTransactionStatus(order_id);
      } catch (apiErr) {
        // Balas non-2xx agar Midtrans mengirim ulang notifikasi nanti.
        logger.error({ order_id, err: apiErr.message }, '[MIDTRANS_WEBHOOK] gagal verifikasi ke API Midtrans');
        return res.status(502).json({ success: false, message: 'Gagal memverifikasi status ke Midtrans.' });
      }
      if (!midtransData || midtransData.order_id !== order_id) {
        logger.error({ order_id }, '[MIDTRANS_WEBHOOK] order_id dari API Midtrans tidak cocok');
        return res.status(502).json({ success: false, message: 'Respons Midtrans tidak cocok.' });
      }

      const orderData = await Payment.getOrderWithItems(payment.order_id);
      if (!orderData || !orderData.order) {
        logger.warn({ paymentId: payment.id }, '[MIDTRANS_WEBHOOK] order tidak ditemukan');
        return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
      }
      const { order } = orderData;

      if (Number(midtransData.gross_amount) !== Number(order.total_pembayaran)) {
        logger.error(
          { order_id, midtrans_amount: midtransData.gross_amount, order_total: order.total_pembayaran },
          '[MIDTRANS_WEBHOOK] jumlah tidak sesuai dengan total order'
        );
        return res.status(400).json({ success: false, message: 'Gross amount tidak sesuai.' });
      }

      const newStatus = mapStatus(midtransData.transaction_status, midtransData.fraud_status);
      logger.info(
        { order_id, transaction_status: midtransData.transaction_status, fraud_status: midtransData.fraud_status, newStatus },
        '[MIDTRANS_WEBHOOK] status terverifikasi'
      );

      // Pembayaran yang sudah di-refund bersifat final: notifikasi lama/tertunda tidak boleh menghidupkannya lagi.
      if (payment.status === 'refunded' && newStatus !== 'refunded') {
        logger.warn({ order_id, newStatus }, '[MIDTRANS_WEBHOOK] notifikasi untuk pembayaran yang sudah di-refund, diabaikan');
        return res.status(200).json({ success: true, message: 'Sudah diproses.' });
      }

      if (newStatus === 'success') {
        const result = await Payment.settleOrderPaid(order.id);
        if (result.outcome === 'late') {
          // Uang sudah masuk tapi order sudah expired/cancelled dan kursi sudah dilepas.
          // Tandai needs_refund supaya admin bisa melihatnya di GET /api/payments/needs-refund.
          await Payment.updatePayment(payment.id, { status: 'success', needs_refund: true });
          logger.error(
            { order_id, orderId: order.id, order_status: result.order_status },
            '[MIDTRANS_WEBHOOK] PEMBAYARAN TERLAMBAT: order sudah tidak aktif. Perlu refund manual.'
          );
        } else {
          await Payment.updatePayment(payment.id, { status: 'success' });
        }
        return res.status(200).json({ success: true, message: 'Notifikasi diproses.' });
      }

      if (newStatus === 'refunded') {
        // Refund/chargeback penuh: batalkan tiket & order (kuota + kursi kembali), tandai payment refunded.
        const refund = await Payment.refundOrder(order.id);
        await Payment.updatePayment(payment.id, { status: 'refunded', needs_refund: false });
        logger.warn({ order_id, orderId: order.id, ...refund }, '[MIDTRANS_WEBHOOK] refund/chargeback diproses');
        if (refund.already_scanned_tickets > 0) {
          logger.error({ order_id, orderId: order.id, scanned: refund.already_scanned_tickets }, '[MIDTRANS_WEBHOOK] refund untuk order yang tiketnya sudah dipindai, periksa manual');
        }
        return res.status(200).json({ success: true, message: 'Refund diproses.' });
      }

      if (newStatus === 'partial_refund') {
        // Tidak bisa ditentukan otomatis tiket mana yang batal.
        logger.error({ order_id, orderId: order.id }, '[MIDTRANS_WEBHOOK] refund PARSIAL diterima, perlu penanganan manual');
        return res.status(200).json({ success: true, message: 'Refund parsial dicatat, perlu penanganan manual.' });
      }

      // Pembayaran yang sudah sukses tidak boleh "mundur" oleh notifikasi non-sukses.
      if (payment.status === 'success') {
        logger.warn({ order_id, newStatus }, '[MIDTRANS_WEBHOOK] notifikasi non-sukses untuk pembayaran yang sudah sukses, diabaikan');
        return res.status(200).json({ success: true, message: 'Sudah diproses.' });
      }

      if (newStatus === 'pending') {
        await Payment.updatePayment(payment.id, { status: 'pending' });
      } else {
        // expired / failed / cancelled
        const target = newStatus === 'expired' ? 'expired' : 'cancelled';
        await Payment.markOrderClosedIfPending(order.id, target);
        await Payment.updatePayment(payment.id, { status: newStatus === 'expired' ? 'expired' : 'failed' });
      }

      return res.status(200).json({ success: true, message: 'Notifikasi diproses.' });
    } catch (error) {
      logger.error({ err: error.message, stack: error.stack }, '[MIDTRANS_WEBHOOK] error');
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
  },

  // GET /api/payments/needs-refund (Admin/SuperAdmin)
  // Pembayaran yang uangnya sudah masuk tetapi order-nya sudah expired/cancelled (bayar terlambat).
  listNeedsRefund: async (req, res) => {
    try {
      const data = await Payment.listNeedsRefund();
      return res.status(200).json({ success: true, message: 'Daftar pembayaran yang perlu di-refund.', data });
    } catch (error) {
      mapError(error, res, 'Error on listNeedsRefund');
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
            const newStatus = mapStatus(midtransData.transaction_status, midtransData.fraud_status);
            if (newStatus === 'success' && Number(midtransData.gross_amount) === Number(result.order.total_pembayaran)) {
              // Sama persis dengan jalur webhook: atomik, idempoten, aman bila berjalan bersamaan.
              const settled = await Payment.settleOrderPaid(result.order.id);
              if (settled.outcome === 'late') {
                await Payment.updatePayment(pendingPayment.id, { status: 'success', needs_refund: true });
                logger.error({ orderId: result.order.id }, '[GET_PAYMENT_SYNC] PEMBAYARAN TERLAMBAT: perlu refund manual');
              } else {
                await Payment.updatePayment(pendingPayment.id, { status: 'success' });
              }
              pendingPayment.status = 'success';
              if (settled.outcome === 'paid' || settled.outcome === 'already_paid') {
                result.order.status_order = 'paid';
              }
            }
          } catch (syncErr) {
            logger.warn({ err: syncErr.message, orderId }, '[GET_PAYMENT_SYNC] sinkronisasi Midtrans dilewati/gagal');
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
      mapError(error, res, 'Error in paymentsController');
    }
  }
};

module.exports = paymentsController;
