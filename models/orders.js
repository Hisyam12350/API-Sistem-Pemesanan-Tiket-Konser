const pool = require('../config/db.js');

const ORDER_COLUMNS = 'id, cutsomer_id, total_pembayaran, status_order, batas_waktu_bayar, created_at';

async function expireOverdueOrders() {
  await pool.query("UPDATE orders SET status_order='expired' WHERE status_order='pending' AND batas_waktu_bayar < NOW();");
}

const Order = {
  async expireOverdue() {
    await expireOverdueOrders();
  },

  async createOrder({ customer_id, seat_ids }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE orders SET status_order='expired' WHERE status_order='pending' AND batas_waktu_bayar < NOW();");

      const seatRes = await client.query(
        'SELECT id, kategori_id, status_kursi, locked_by, locked_until FROM seats WHERE id = ANY($1::bigint[]) FOR UPDATE',
        [seat_ids]
      );

      if (seatRes.rows.length !== seat_ids.length) {
        const err = new Error('Beberapa kursi tidak ditemukan.');
        err.status = 409;
        throw err;
      }

      const now = new Date();
      for (const seat of seatRes.rows) {
        if (seat.status_kursi !== 'locked') {
          const err = new Error(`Kursi ${seat.id} tidak dalam status locked.`);
          err.status = 409;
          throw err;
        }
        if (Number(seat.locked_by) !== Number(customer_id)) {
          const err = new Error(`Kursi ${seat.id} tidak dimiliki oleh pengguna.`);
          err.status = 409;
          throw err;
        }
        if (!seat.locked_until || new Date(seat.locked_until) <= now) {
          const err = new Error(`Lock kursi ${seat.id} telah kadaluwarsa.`);
          err.status = 409;
          throw err;
        }
      }

      const orderRes = await client.query(
        "INSERT INTO orders (cutsomer_id, status_order, batas_waktu_bayar) VALUES ($1, 'pending', NOW() + interval '15 minutes') RETURNING " + ORDER_COLUMNS,
        [customer_id]
      );
      const order = orderRes.rows[0];

      // group seats by category
      const groups = {};
      for (const seat of seatRes.rows) {
        if (!groups[seat.kategori_id]) groups[seat.kategori_id] = [];
        groups[seat.kategori_id].push(seat.id);
      }

      const items = [];
      for (const catId of Object.keys(groups)) {
        const catRes = await client.query('SELECT id, harga FROM ticket_categories WHERE id = $1', [catId]);
        if (catRes.rows.length === 0) {
          const err = new Error(`Kategori tiket dengan ID ${catId} tidak ditemukan.`);
          err.status = 404;
          throw err;
        }
        const category = catRes.rows[0];
        const jumlah = groups[catId].length;
        const harga_satuan = category.harga;

        const itemRes = await client.query(
          'INSERT INTO order_items (order_id, kategori_id, jumlah, harga_satuan) VALUES ($1, $2, $3, $4) RETURNING id, order_id, kategori_id, jumlah, harga_satuan, created_at',
          [order.id, catId, jumlah, harga_satuan]
        );
        const item = itemRes.rows[0];

        for (const seatId of groups[catId]) {
          await client.query(
            'INSERT INTO order_item_seats (order_item_id, seat_id) VALUES ($1, $2)',
            [item.id, seatId]
          );
        }

        items.push({ ...item, seat_ids: groups[catId] });
      }

      await client.query('COMMIT');

      return { order, items };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getOrders(userId, role) {
    await expireOverdueOrders();
    const isAdmin = role === 'Admin' || role === 'SuperAdmin';
    let result;
    if (isAdmin) {
      result = await pool.query('SELECT ' + ORDER_COLUMNS + ' FROM orders ORDER BY created_at DESC');
    } else {
      result = await pool.query('SELECT ' + ORDER_COLUMNS + ' FROM orders WHERE cutsomer_id = $1 ORDER BY created_at DESC', [userId]);
    }
    return result.rows;
  },

  async getOrderById(id, userId, role) {
    await expireOverdueOrders();
    const result = await pool.query('SELECT ' + ORDER_COLUMNS + ' FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    const order = result.rows[0];
    const isAdmin = role === 'Admin' || role === 'SuperAdmin';
    if (!isAdmin && Number(order.cutsomer_id) !== Number(userId)) {
      const err = new Error('Akses ditolak.');
      err.status = 403;
      throw err;
    }

    const itemsRes = await pool.query(
      'SELECT id, order_id, kategori_id, jumlah, harga_satuan, created_at FROM order_items WHERE order_id = $1',
      [id]
    );
    const items = [];
    for (const item of itemsRes.rows) {
      const seatsRes = await pool.query(
        'SELECT s.id, s.nomor_kursi, s.status_kursi FROM seats s JOIN order_item_seats ois ON ois.seat_id = s.id WHERE ois.order_item_id = $1',
        [item.id]
      );
      items.push({ ...item, seats: seatsRes.rows });
    }
    return { order, items };
  },

  async payOrder(id, userId, role) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE orders SET status_order='expired' WHERE status_order='pending' AND batas_waktu_bayar < NOW();");

      const result = await client.query('SELECT ' + ORDER_COLUMNS + ' FROM orders WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        const err = new Error('Order tidak ditemukan.');
        err.status = 404;
        throw err;
      }
      const order = result.rows[0];
      const isAdmin = role === 'Admin' || role === 'SuperAdmin';
      if (!isAdmin && Number(order.cutsomer_id) !== Number(userId)) {
        const err = new Error('Akses ditolak.');
        err.status = 403;
        throw err;
      }
      if (order.status_order !== 'pending') {
        const err = new Error('Hanya order pending yang dapat dibayar.');
        err.status = 409;
        throw err;
      }

      await client.query("UPDATE orders SET status_order='paid' WHERE id = $1", [id]);
      await client.query(
        `UPDATE seats SET status_kursi='booked', locked_until=NULL, locked_by=NULL
         FROM order_item_seats ois
         JOIN order_items oi ON oi.id = ois.order_item_id
         WHERE ois.seat_id = seats.id AND oi.order_id = $1`,
        [id]
      );
      await client.query(
        'INSERT INTO payments (order_id, payment_method, amount, status) VALUES ($1, $2, $3, $4)',
        [id, 'manual', order.total_pembayaran, 'success']
      );

      await client.query('COMMIT');
      return { ...order, status_order: 'paid' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async cancelOrder(id, userId, role) {
    await expireOverdueOrders();
    const result = await pool.query('SELECT ' + ORDER_COLUMNS + ' FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Order tidak ditemukan.');
      err.status = 404;
      throw err;
    }
    const order = result.rows[0];
    const isAdmin = role === 'Admin' || role === 'SuperAdmin';
    if (!isAdmin && Number(order.cutsomer_id) !== Number(userId)) {
      const err = new Error('Akses ditolak.');
      err.status = 403;
      throw err;
    }
    if (order.status_order !== 'pending') {
      const err = new Error('Hanya order pending yang dapat dibatalkan.');
      err.status = 409;
      throw err;
    }
    await pool.query("UPDATE orders SET status_order='cancelled' WHERE id = $1", [id]);
    return { ...order, status_order: 'cancelled' };
  }
};

module.exports = Order;
