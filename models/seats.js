const supabase = require('../config/supabase.js');
const pool = require('../config/db.js');
const { MAX_SEATS_PER_ORDER } = require('../config/limits.js');

// Kolom publik: TIDAK menyertakan locked_by (ID user pemegang lock) agar endpoint publik
// tidak membocorkan identitas user.
const PUBLIC_COLUMNS = 'id, kategori_id, nomor_kursi, status_kursi, locked_until, created_at';
const OWNER_COLUMNS = 'id, kategori_id, nomor_kursi, status_kursi, locked_until, locked_by, created_at';

// Kursi dianggap "lock basi" (boleh diambil orang lain) bila: status locked, locked_until lewat,
// DAN tidak sedang dipegang order pending (order_item_seats). Kursi milik order pending tidak boleh
// dilepas hanya karena waktu lock awalnya habis.
const STALE_LOCK_SQL = `(s.status_kursi = 'locked' AND s.locked_until < NOW()
  AND NOT EXISTS (SELECT 1 FROM order_item_seats ois WHERE ois.seat_id = s.id))`;

const Seat = {
  // Hanya MEMBACA. Lock basi ditampilkan sebagai 'available' tanpa menulis ke DB
  // (sebelumnya GET publik melakukan UPDATE; pembersihan sebenarnya dilakukan pg_cron & saat lock).
  async getSeatsByCategory(kategoriId, viewerUserId = null) {
    const res = await pool.query(
      `SELECT s.id, s.kategori_id, s.nomor_kursi,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM tickets t
                   WHERE t.seat_id = s.id AND t.status_tiket <> 'cancelled'
                ) THEN 'booked'::seat_status
                WHEN ${STALE_LOCK_SQL} THEN 'available'::seat_status
                WHEN (
                  s.status_kursi = 'locked'
                  AND EXISTS (
                    SELECT 1
                      FROM order_item_seats ois
                      JOIN order_items oi ON oi.id = ois.order_item_id
                      JOIN orders o ON o.id = oi.order_id
                     WHERE ois.seat_id = s.id
                       AND (o.status_order <> 'pending' OR o.batas_waktu_bayar < NOW())
                  )
                ) THEN 'available'::seat_status
                ELSE s.status_kursi
              END AS status_kursi,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM tickets t
                   WHERE t.seat_id = s.id AND t.status_tiket <> 'cancelled'
                ) THEN NULL
                WHEN ${STALE_LOCK_SQL} THEN NULL
                ELSE s.locked_until
              END AS locked_until,
              (
                $2::bigint IS NOT NULL
                AND s.status_kursi = 'locked'
                AND s.locked_by = $2::bigint
                AND (s.locked_until IS NULL OR s.locked_until >= NOW())
                AND NOT EXISTS (SELECT 1 FROM order_item_seats ois WHERE ois.seat_id = s.id)
                AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.seat_id = s.id AND t.status_tiket <> 'cancelled')
              ) AS locked_by_me,
              s.created_at
         FROM seats s
        WHERE s.kategori_id = $1
        ORDER BY s.id ASC`,
      [kategoriId, viewerUserId]
    );
    return res.rows;
  },

  async getSeatById(id) {
    const { data, error } = await supabase
      .from('seats')
      .select(PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSeatNumbersByCategory(kategoriId) {
    const { data, error } = await supabase
      .from('seats')
      .select('nomor_kursi')
      .eq('kategori_id', kategoriId);

    if (error) throw error;
    return data.map((row) => row.nomor_kursi);
  },

  async generateSeats(kategoriId, seatNumbers) {
    const rows = seatNumbers.map((nomor) => ({ kategori_id: kategoriId, nomor_kursi: nomor }));
    const { data, error } = await supabase
      .from('seats')
      .insert(rows)
      .select(PUBLIC_COLUMNS)
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Kunci beberapa kursi SECARA ATOMIK dalam satu transaksi (semua berhasil atau tidak ada sama sekali).
   * Aturan yang ditegakkan di sini (bukan hanya di UI):
   *  - event harus masih dijual (status 'upcoming' dan waktu_event belum lewat)
   *  - kursi harus tersedia (atau lock basi / lock milik user sendiri yang belum jadi order)
   *  - satu user maksimal menahan MAX_SEATS_PER_ORDER kursi per event
   *
   * Mengembalikan { ok: true, seats } atau { ok: false, status, message, failed_seat_ids? }.
   */
  async lockSeatsAtomic({ seatIds, userId, lockedUntil }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lepaskan kursi dari order pending yang sudah melewati batas waktu bayar (bila cron belum berjalan)
      await client.query(
        `UPDATE orders
            SET status_order = 'expired'
          WHERE status_order = 'pending'
            AND batas_waktu_bayar < NOW()
            AND id IN (
              SELECT oi.order_id
                FROM order_items oi
                JOIN order_item_seats ois ON ois.order_item_id = oi.id
               WHERE ois.seat_id = ANY($1::bigint[])
            )`,
        [seatIds]
      );

      const found = await client.query(
        `SELECT s.id,
                e.id AS event_id,
                (e.status = 'upcoming' AND e.waktu_event > NOW()) AS sales_open,
                (   NOT EXISTS (
                      SELECT 1 FROM tickets t
                       WHERE t.seat_id = s.id AND t.status_tiket <> 'cancelled'
                    )
                 AND (   s.status_kursi = 'available'
                      OR ${STALE_LOCK_SQL}
                      OR (s.status_kursi = 'locked' AND s.locked_by = $2
                          AND NOT EXISTS (SELECT 1 FROM order_item_seats ois WHERE ois.seat_id = s.id))
                     )
                ) AS free
           FROM seats s
           JOIN ticket_categories tc ON tc.id = s.kategori_id
           JOIN events e ON e.id = tc.event_id
          WHERE s.id = ANY($1::bigint[])
          ORDER BY s.id
            FOR UPDATE OF s`,
        [seatIds, userId]
      );

      const foundIds = new Set(found.rows.map((r) => Number(r.id)));
      const missing = seatIds.filter((id) => !foundIds.has(Number(id)));
      const notFree = found.rows.filter((r) => !r.free).map((r) => Number(r.id));
      const failed = [...missing, ...notFree];

      if (failed.length > 0) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 409,
          message: 'Sebagian kursi tidak tersedia (sudah di-lock/dibooking). Tidak ada kursi yang dikunci.',
          failed_seat_ids: failed
        };
      }

      if (found.rows.some((r) => !r.sales_open)) {
        await client.query('ROLLBACK');
        return { ok: false, status: 409, message: 'Penjualan tiket untuk event ini sudah ditutup.' };
      }

      // Batas penahanan per user per event (kursi yang sudah dipegang user & bukan bagian dari request ini).
      const perEvent = {};
      for (const r of found.rows) perEvent[r.event_id] = (perEvent[r.event_id] || 0) + 1;
      const heldRes = await client.query(
        `SELECT tc.event_id, COUNT(*)::int AS n
           FROM seats s
           JOIN ticket_categories tc ON tc.id = s.kategori_id
          WHERE s.locked_by = $1
            AND s.status_kursi = 'locked'
            AND NOT (${STALE_LOCK_SQL})
            AND NOT (s.id = ANY($2::bigint[]))
          GROUP BY tc.event_id`,
        [userId, seatIds]
      );
      const held = Object.fromEntries(heldRes.rows.map((r) => [r.event_id, r.n]));
      for (const [eventId, adding] of Object.entries(perEvent)) {
        if ((held[eventId] || 0) + adding > MAX_SEATS_PER_ORDER) {
          await client.query('ROLLBACK');
          return {
            ok: false,
            status: 409,
            message: `Maksimal ${MAX_SEATS_PER_ORDER} kursi yang dapat ditahan per event. Lepaskan kursi lain atau selesaikan pembayaran terlebih dahulu.`
          };
        }
      }

      const upd = await client.query(
        `UPDATE seats
            SET status_kursi = 'locked', locked_until = $2, locked_by = $3
          WHERE id = ANY($1::bigint[])
      RETURNING ${OWNER_COLUMNS}`,
        [seatIds, lockedUntil, userId]
      );
      await client.query('COMMIT');
      return { ok: true, seats: upd.rows.sort((a, b) => Number(a.id) - Number(b.id)) };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* koneksi sudah putus */ }
      throw err;
    } finally {
      client.release();
    }
  },

  // Lepas lock. Kursi yang sudah menjadi bagian order pending TIDAK dilepas lewat sini
  // (batalkan ordernya: POST /api/orders/:id/cancel). userId null = admin (boleh lepas lock siapa pun).
  async unlockSeats(seatIds, userId = null) {
    const res = await pool.query(
      `UPDATE seats
          SET status_kursi = 'available', locked_until = NULL, locked_by = NULL
        WHERE id = ANY($1::bigint[])
          AND status_kursi = 'locked'
          AND ($2::bigint IS NULL OR locked_by = $2)
          AND NOT EXISTS (SELECT 1 FROM order_item_seats ois WHERE ois.seat_id = seats.id)
    RETURNING ${OWNER_COLUMNS}`,
      [seatIds, userId]
    );
    return res.rows;
  }
};

module.exports = Seat;
