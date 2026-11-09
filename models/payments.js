const pool = require('../config/db.js');

const Payment = {
  async findByOrderId(orderId) {
    const res = await pool.query(
      'SELECT id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );
    return res.rows;
  },

  async findPendingByOrderId(orderId) {
    const res = await pool.query(
      "SELECT id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, created_at FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [orderId]
    );
    return res.rows[0] || null;
  },

  async findByTransactionId(txId) {
    const res = await pool.query(
      'SELECT id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, created_at FROM payments WHERE transaction_id = $1 LIMIT 1',
      [txId]
    );
    return res.rows[0] || null;
  },

  async createPayment({ order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id }) {
    const res = await pool.query(
      'INSERT INTO payments (order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, created_at',
      [order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id]
    );
    return res.rows[0];
  },

  async updatePayment(id, updates) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const key of Object.keys(updates)) {
      fields.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
    values.push(id);
    const res = await pool.query(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, order_id, transaction_id, payment_method, amount, status, snap_token, redirect_url, midtrans_order_id, created_at`,
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

  async generateTickets(orderId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // idempotency: check existing
      const existing = await client.query('SELECT COUNT(*)::int AS c FROM tickets WHERE order_id = $1', [orderId]);
      if (existing.rows[0].c > 0) {
        await client.query('COMMIT');
        return [];
      }
      const itemsRes = await client.query('SELECT id, kategori_id FROM order_items WHERE order_id = $1', [orderId]);
      const tickets = [];
      for (const item of itemsRes.rows) {
        const seatsRes = await client.query('SELECT seat_id FROM order_item_seats WHERE order_item_id = $1', [item.id]);
        for (const s of seatsRes.rows) {
          const seatId = s.seat_id;
          let inserted = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            const code = `TKT-${orderId}-${seatId}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            try {
              const r = await client.query(
                "INSERT INTO tickets (order_id, kategori_id, seat_id, kode_unik, status_tiket) VALUES ($1,$2,$3,$4,'active') RETURNING id, order_id, kategori_id, seat_id, kode_unik, status_tiket, created_at",
                [orderId, item.kategori_id, seatId, code]
              );
              tickets.push(r.rows[0]);
              inserted = true;
              break;
            } catch (e) {
              if (e.code !== '23505') throw e;
            }
          }
          if (!inserted) throw new Error('Gagal generate kode tiket unik.');
        }
      }
      await client.query('COMMIT');
      return tickets;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getTicketsByOrderId(orderId) {
    const res = await pool.query('SELECT id, order_id, kategori_id, seat_id, kode_unik, status_tiket, created_at FROM tickets WHERE order_id = $1', [orderId]);
    return res.rows;
  }
};

module.exports = Payment;
