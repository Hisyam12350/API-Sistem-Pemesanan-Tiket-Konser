const pool = require('../config/db.js');
const { MAX_SEATS_PER_ORDER, ORDER_PAYMENT_MINUTES } = require('../config/limits.js');

const ORDER_COLUMNS = 'id, cutsomer_id, total_pembayaran, status_order, batas_waktu_bayar, created_at';

const httpErr = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

async function expireOverdueOrders(db = pool) {
  await db.query("UPDATE orders SET status_order='expired' WHERE status_order='pending' AND batas_waktu_bayar < NOW();");
}

const isAdminRole = (role) => role === 'Admin' || role === 'SuperAdmin';

const Order = {
  async expireOverdue() {
    await expireOverdueOrders();
  },

  async createOrder({ customer_id, seat_ids }) {
    // Pertahanan berlapis (validator juga sudah membatasi): hilangkan duplikat & batasi jumlah.
    const seatIds = [...new Set(seat_ids.map(Number))].sort((a, b) => a - b);
    if (seatIds.length === 0) throw httpErr(400, 'seat_ids tidak boleh kosong.');
    if (seatIds.length > MAX_SEATS_PER_ORDER) {
      throw httpErr(400, `Maksimal ${MAX_SEATS_PER_ORDER} kursi per order.`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expireOverdueOrders(client);

      // Urut per id => semua transaksi mengunci baris dalam urutan sama (mencegah deadlock).
      const seatRes = await client.query(
        `SELECT s.id, s.kategori_id, s.status_kursi, s.locked_by, s.locked_until,
                e.id AS event_id,
                (e.status = 'upcoming' AND e.waktu_event > NOW()) AS sales_open
           FROM seats s
           JOIN ticket_categories tc ON tc.id = s.kategori_id
           JOIN events e ON e.id = tc.event_id
          WHERE s.id = ANY($1::bigint[])
          ORDER BY s.id
            FOR UPDATE OF s`,
        [seatIds]
      );

      if (seatRes.rows.length !== seatIds.length) {
        throw httpErr(409, 'Beberapa kursi tidak ditemukan.');
      }

      const now = new Date();
      for (const seat of seatRes.rows) {
        if (seat.status_kursi !== 'locked') {
          throw httpErr(409, `Kursi ${seat.id} tidak dalam status locked.`);
        }
        if (Number(seat.locked_by) !== Number(customer_id)) {
          throw httpErr(409, `Kursi ${seat.id} tidak dimiliki oleh pengguna.`);
        }
        if (!seat.locked_until || new Date(seat.locked_until) <= now) {
          throw httpErr(409, `Lock kursi ${seat.id} telah kadaluwarsa.`);
        }
        if (!seat.sales_open) {
          throw httpErr(409, 'Penjualan tiket untuk event ini sudah ditutup.');
        }
      }

      // Satu order = satu event (pembayaran, tiket, dan scanner bekerja per event).
      if (new Set(seatRes.rows.map((s) => String(s.event_id))).size > 1) {
        throw httpErr(400, 'Satu order hanya boleh berisi kursi dari satu event yang sama.');
      }

      const orderRes = await client.query(
        `INSERT INTO orders (cutsomer_id, status_order, batas_waktu_bayar)
         VALUES ($1, 'pending', NOW() + make_interval(mins => $2)) RETURNING ${ORDER_COLUMNS}`,
        [customer_id, ORDER_PAYMENT_MINUTES]
      );
      const order = orderRes.rows[0];

      // Perpanjang lock kursi sampai batas bayar: sebelumnya lock bisa habis (mis. 5 menit) sebelum
      // order (15 menit) expired, sehingga kursi dilepas lalu dibeli orang lain saat order masih pending.
      await client.query(
        'UPDATE seats SET locked_until = $2 WHERE id = ANY($1::bigint[])',
        [seatIds, order.batas_waktu_bayar]
      );

      const groups = {};
      for (const seat of seatRes.rows) {
        if (!groups[seat.kategori_id]) groups[seat.kategori_id] = [];
        groups[seat.kategori_id].push(seat.id);
      }

      const items = [];
      for (const catId of Object.keys(groups)) {
        const catRes = await client.query('SELECT id, harga FROM ticket_categories WHERE id = $1', [catId]);
        if (catRes.rows.length === 0) {
          throw httpErr(404, `Kategori tiket dengan ID ${catId} tidak ditemukan.`);
        }
        const category = catRes.rows[0];
        const jumlah = groups[catId].length;

        const itemRes = await client.query(
          'INSERT INTO order_items (order_id, kategori_id, jumlah, harga_satuan) VALUES ($1, $2, $3, $4) RETURNING id, order_id, kategori_id, jumlah, harga_satuan, created_at',
          [order.id, catId, jumlah, category.harga]
        );
        const item = itemRes.rows[0];

        await client.query(
          'INSERT INTO order_item_seats (order_item_id, seat_id) SELECT $1, UNNEST($2::bigint[])',
          [item.id, groups[catId]]
        );

        items.push({ ...item, seat_ids: groups[catId] });
      }

      await client.query('COMMIT');

      // Ambil ulang supaya total_pembayaran (dihitung trigger) ikut terbaca.
      const fresh = await pool.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [order.id]);
      return { order: fresh.rows[0] || order, items };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* koneksi sudah putus; error asli lebih penting */ }
      throw err;
    } finally {
      client.release();
    }
  },

  async getOrders(userId, role) {
    await expireOverdueOrders();
    let result;
    if (isAdminRole(role)) {
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
    if (!isAdminRole(role) && Number(order.cutsomer_id) !== Number(userId)) {
      throw httpErr(403, 'Akses ditolak.');
    }

    // Satu query (sebelumnya N+1: satu query kursi per item).
    const itemsRes = await pool.query(
      `SELECT oi.id, oi.order_id, oi.kategori_id, oi.jumlah, oi.harga_satuan, oi.created_at,
              tc.nama_kategori,
              COALESCE(
                json_agg(json_build_object('id', s.id, 'nomor_kursi', s.nomor_kursi, 'status_kursi', s.status_kursi)
                         ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS seats
         FROM order_items oi
         LEFT JOIN ticket_categories tc ON tc.id = oi.kategori_id
         LEFT JOIN order_item_seats ois ON ois.order_item_id = oi.id
         LEFT JOIN seats s ON s.id = ois.seat_id
        WHERE oi.order_id = $1
        GROUP BY oi.id, tc.nama_kategori
        ORDER BY oi.id`,
      [id]
    );
    return { order, items: itemsRes.rows };
  },

  // Pembatalan race-safe: baris order dikunci; bila webhook sedang membayar (paid) di saat yang sama,
  // salah satu menang dan yang lain mendapat 409 — tidak ada order 'paid' yang ditimpa jadi 'cancelled'.
  async cancelOrder(id, userId, role) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expireOverdueOrders(client);

      const result = await client.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 FOR UPDATE`, [id]);
      if (result.rows.length === 0) throw httpErr(404, 'Order tidak ditemukan.');
      const order = result.rows[0];

      if (!isAdminRole(role) && Number(order.cutsomer_id) !== Number(userId)) {
        throw httpErr(403, 'Akses ditolak.');
      }
      if (order.status_order !== 'pending') {
        throw httpErr(409, 'Hanya order pending yang dapat dibatalkan.');
      }

      const upd = await client.query(
        `UPDATE orders SET status_order = 'cancelled' WHERE id = $1 AND status_order = 'pending' RETURNING ${ORDER_COLUMNS}`,
        [id]
      );
      if (upd.rowCount === 0) throw httpErr(409, 'Hanya order pending yang dapat dibatalkan.');

      await client.query('COMMIT');
      return upd.rows[0];
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* abaikan */ }
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = Order;
