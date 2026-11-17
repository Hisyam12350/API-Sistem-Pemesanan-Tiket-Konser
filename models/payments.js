const crypto = require('crypto');
const pool = require('../config/db.js');

const PAYMENT_COLUMNS = 'id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, needs_refund, created_at';

// Kolom yang boleh diubah lewat updatePayment (daftar putih: nama kolom tidak pernah berasal dari input).
const UPDATABLE_PAYMENT_COLUMNS = ['status', 'payment_method', 'snap_token', 'redirect_url', 'needs_refund'];

const Payment = {
  async findByOrderId(orderId) {
    const res = await pool.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId]
    );
    return res.rows;
  },

  async findPendingByOrderId(orderId) {
    const res = await pool.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    return res.rows[0] || null;
  },

  async findByTransactionId(txId) {
    const res = await pool.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE transaction_id = $1 LIMIT 1`,
      [txId]
    );
    return res.rows[0] || null;
  },

  async createPayment({ order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id }) {
    const res = await pool.query(
      `INSERT INTO payments (order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${PAYMENT_COLUMNS}`,
      [order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id]
    );
    return res.rows[0];
  },

  async updatePayment(id, updates) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const key of Object.keys(updates)) {
      if (!UPDATABLE_PAYMENT_COLUMNS.includes(key)) throw new Error(`Kolom payments tidak boleh diubah: ${key}`);
      fields.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
    let statusGuard = '';
    if (updates.status === 'success') {
      statusGuard = " AND status <> 'refunded'";
    } else if (updates.status && updates.status !== 'refunded') {
      statusGuard = " AND status = 'pending'";
    }
    values.push(id);
    const res = await pool.query(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx}${statusGuard} RETURNING ${PAYMENT_COLUMNS}`,
      values
    );
    return res.rows[0];
  },

  async getOrderWithItems(orderId) {
    const orderRes = await pool.query('SELECT id, cutsomer_id, total_pembayaran, status_order, batas_waktu_bayar, created_at FROM orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) return null;
    const order = orderRes.rows[0];
    const itemsRes = await pool.query('SELECT id, order_id, kategori_id, jumlah, harga_satuan, created_at FROM order_items WHERE order_id = $1', [orderId]);
    const items = [];
    for (const item of itemsRes.rows) {
      const seatsRes = await pool.query(
        'SELECT s.id, s.nomor_kursi FROM seats s JOIN order_item_seats ois ON ois.seat_id = s.id WHERE ois.order_item_id = $1',
        [item.id]
      );
      items.push({ ...item, seats: seatsRes.rows });
    }
    return { order, items };
  },

  // Membuat tiket untuk semua kursi pada order, DI DALAM transaksi milik pemanggil.
  // Aman dipanggil berulang (idempoten): kursi yang sudah punya tiket aktif dilewati berkat
  // unique index parsial uq_tickets_active_seat (migrasi 007), sehingga satu kursi
  // tidak pernah bisa memiliki dua QR yang sama-sama valid, bahkan bila dua proses berjalan bersamaan.
  async generateTicketsTx(client, orderId) {
    const seatsRes = await client.query(
      `SELECT oi.kategori_id, ois.seat_id
         FROM order_items oi
         JOIN order_item_seats ois ON ois.order_item_id = oi.id
        WHERE oi.order_id = $1
        ORDER BY ois.seat_id`,
      [orderId]
    );

    const tickets = [];
    for (const row of seatsRes.rows) {
      // 16 hex acak dari CSPRNG (64 bit) -- bukan Math.random() -- sehingga kode tidak bisa ditebak.
      const code = `TKT-${orderId}-${row.seat_id}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const r = await client.query(
        `INSERT INTO tickets (order_id, kategori_id, seat_id, kode_unik, status_tiket)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (seat_id) WHERE status_tiket <> 'cancelled' DO NOTHING
         RETURNING id, order_id, kategori_id, seat_id, kode_unik, status_tiket, created_at`,
        [orderId, row.kategori_id, row.seat_id, code]
      );
      if (r.rows[0]) tickets.push(r.rows[0]);
    }
    return tickets;
  },

  // Menandai order LUNAS + memesan kursi + menerbitkan tiket dalam SATU transaksi.
  // Baris order dikunci (FOR UPDATE) sehingga webhook Midtrans dan polling GET /payments/:orderId
  // yang datang bersamaan akan antre, bukan berebut.
  //
  // Hasil `outcome`:
  //   'paid'         : order pending -> paid, tiket baru diterbitkan
  //   'already_paid' : order sudah paid (tiket yang hilang, bila ada, dilengkapi)
  //   'late'         : order sudah expired/cancelled saat uang masuk -> TIDAK diubah jadi paid
  //                    (kursi sudah dilepas); pembayaran perlu di-refund manual
  //   'not_found'    : order tidak ada
  async settleOrderPaid(orderId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT id, status_order FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { outcome: 'not_found' };
      }

      const status = orderRes.rows[0].status_order;
      if (status !== 'pending' && status !== 'paid') {
        await client.query('COMMIT');
        return { outcome: 'late', order_status: status };
      }

      let outcome = 'already_paid';
      if (status === 'pending') {
        await client.query("UPDATE orders SET status_order='paid' WHERE id = $1", [orderId]);
        await client.query(
          `UPDATE seats SET status_kursi='booked', locked_until=NULL, locked_by=NULL
             FROM order_item_seats ois
             JOIN order_items oi ON oi.id = ois.order_item_id
            WHERE ois.seat_id = seats.id AND oi.order_id = $1`,
          [orderId]
        );
        outcome = 'paid';
      }

      const tickets = await Payment.generateTicketsTx(client, orderId);
      await client.query('COMMIT');
      return { outcome, tickets };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* koneksi sudah putus */ }
      throw err;
    } finally {
      client.release();
    }
  },

  // Pengembalian dana penuh (notifikasi 'refund'/'chargeback' dari Midtrans):
  // batalkan tiket yang belum dipakai dan batalkan order, sehingga trigger DB mengembalikan
  // kuota & membebaskan kursi. Atomik dan idempoten (aman bila notifikasi dikirim berulang).
  //
  // Hasil `outcome`: 'refunded' | 'order_not_paid' (order sudah expired/cancelled/pending) | 'not_found'
  async refundOrder(orderId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderRes = await client.query('SELECT id, status_order FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { outcome: 'not_found' };
      }
      const status = orderRes.rows[0].status_order;
      if (status !== 'paid') {
        // pending -> tutup sebagai cancelled supaya kursi tidak tertahan; selain itu tidak ada yang perlu diubah.
        if (status === 'pending') {
          await client.query("UPDATE orders SET status_order = 'cancelled' WHERE id = $1", [orderId]);
        }
        await client.query('COMMIT');
        return { outcome: 'order_not_paid', order_status: status };
      }

      const cancelled = await client.query(
        "UPDATE tickets SET status_tiket = 'cancelled' WHERE order_id = $1 AND status_tiket = 'active'",
        [orderId]
      );
      const scanned = await client.query(
        "SELECT COUNT(*)::int AS n FROM tickets WHERE order_id = $1 AND status_tiket = 'scanned'",
        [orderId]
      );
      // Trigger trigger_kembalikan_kuota: kuota dikembalikan, kursi dibebaskan, order_item_seats dihapus.
      await client.query("UPDATE orders SET status_order = 'cancelled' WHERE id = $1", [orderId]);
      await client.query('COMMIT');
      return { outcome: 'refunded', cancelled_tickets: cancelled.rowCount, already_scanned_tickets: scanned.rows[0].n };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* koneksi sudah putus */ }
      throw err;
    } finally {
      client.release();
    }
  },

  // Daftar pembayaran yang uangnya sudah masuk tetapi order-nya sudah tidak aktif (perlu refund manual).
  async listNeedsRefund() {
    const res = await pool.query(
      `SELECT p.id, p.order_id, p.transaction_id, p.amount, p.status, p.created_at,
              o.status_order, o.cutsomer_id, u.username, u.email
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN users u ON u.id = o.cutsomer_id
        WHERE p.needs_refund = TRUE
        ORDER BY p.created_at DESC`
    );
    return res.rows;
  },

  // Tandai order batal/expired HANYA jika masih pending (tidak menimpa order yang sudah paid).
  async markOrderClosedIfPending(orderId, targetStatus) {
    const res = await pool.query(
      "UPDATE orders SET status_order = $1 WHERE id = $2 AND status_order = 'pending' RETURNING id",
      [targetStatus, orderId]
    );
    return res.rowCount > 0;
  },

  async getTicketsByOrderId(orderId) {
    const res = await pool.query('SELECT id, order_id, kategori_id, seat_id, kode_unik, status_tiket, created_at FROM tickets WHERE order_id = $1', [orderId]);
    return res.rows;
  }
};

module.exports = Payment;
