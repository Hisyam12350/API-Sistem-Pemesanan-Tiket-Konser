const pool = require('../config/db');
const ScannerAssignment = require('../models/scannerAssignments');
const { mapError } = require('../utils/httpError');
const { CHECKIN_OPENS_HOURS_BEFORE, CHECKIN_CLOSES_HOURS_AFTER } = require('../config/limits');

const HOUR = 3600 * 1000;

const scannerController = {
  async getAssignedEvents(req, res) {
    try {
      const events = await ScannerAssignment.listAssignedEvents(req.user.id);
      return res.status(200).json({ success: true, data: events });
    } catch (error) {
      return mapError(error, res, 'Error on getAssignedEvents');
    }
  },

  async getEventAssignments(req, res) {
    try {
      const { eventId } = req.validated;
      const result = await ScannerAssignment.listScannersForEvent(eventId);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
      }
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return mapError(error, res, 'Error on getEventAssignments');
    }
  },

  async checkIn(req, res) {
    try {
      const { kode_unik, event_id } = req.validated;

      if (req.user.role === 'Scanner' && !await ScannerAssignment.isAssigned(req.user.id, event_id)) {
        return res.status(403).json({ success: false, message: 'Anda tidak ditugaskan untuk event ini.' });
      }

      // Join langsung lewat kolom tiket sendiri (tickets.order_id & tickets.kategori_id), tidak lagi lewat
      // seats -> order_item_seats, supaya tiket tetap ditemukan walaupun relasi kursi sudah berubah.
      const result = await pool.query(
        `SELECT
           t.id AS ticket_id, t.kode_unik, t.status_tiket,
           s.id AS seat_id, s.nomor_kursi,
           tc.id AS category_id, tc.nama_kategori,
           e.id AS event_id, e.nama_event, e.waktu_event, e.status AS event_status, e.venue_id,
           g.nama_genre, v.nama_venue, v.alamat,
           o.id AS order_id, o.status_order
         FROM tickets t
         JOIN ticket_categories tc ON tc.id = t.kategori_id
         JOIN events e ON e.id = tc.event_id
         JOIN orders o ON o.id = t.order_id
         LEFT JOIN seats s ON s.id = t.seat_id
         LEFT JOIN genres g ON g.id = e.genre_id
         LEFT JOIN venues v ON v.id = e.venue_id
        WHERE t.kode_unik = $1`,
        [kode_unik]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
      }

      const ticket = result.rows[0];

      // Tiket milik event lain -> tolak (scanner dikunci ke event yang sedang dijaga).
      if (Number(ticket.event_id) !== Number(event_id)) {
        return res.status(409).json({ success: false, message: 'Tiket ini bukan untuk event yang sedang di-scan.' });
      }

      // Hanya order yang LUNAS yang boleh masuk (order refund/batal tidak valid walau QR masih ada).
      if (ticket.status_order !== 'paid') {
        return res.status(409).json({ success: false, message: 'Order tiket ini tidak berstatus lunas.' });
      }

      if (ticket.status_tiket !== 'active') {
        return res.status(409).json({
          success: false,
          message: `Tiket sudah ${ticket.status_tiket === 'scanned' ? 'dipindai' : 'tidak aktif'}.`
        });
      }

      if (!['upcoming', 'ongoing'].includes(ticket.event_status)) {
        return res.status(409).json({ success: false, message: 'Event tidak dalam status yang memungkinkan check-in.' });
      }

      // Jendela check-in: dibuka X jam sebelum acara, ditutup Y jam setelah acara mulai.
      // (Sebelumnya tiket bisa dipindai berminggu-minggu sebelum acara, atau setelah acara bila status belum diubah.)
      const eventTime = new Date(ticket.waktu_event).getTime();
      const now = Date.now();
      if (now < eventTime - CHECKIN_OPENS_HOURS_BEFORE * HOUR) {
        return res.status(409).json({ success: false, message: 'Check-in belum dibuka untuk event ini.' });
      }
      if (now > eventTime + CHECKIN_CLOSES_HOURS_AFTER * HOUR) {
        return res.status(409).json({ success: false, message: 'Check-in untuk event ini sudah ditutup.' });
      }

      // CHECK-IN ATOMIK: status diubah hanya jika MASIH 'active' (dan order masih lunas) dalam satu UPDATE.
      // Bila dua scanner memindai QR yang sama bersamaan, hanya satu yang mendapat baris kembali.
      const updateResult = await pool.query(
        `UPDATE tickets
            SET status_tiket = 'scanned', scanned_at = NOW(), scanned_by = $2
          WHERE id = $1 AND status_tiket = 'active'
            AND EXISTS (SELECT 1 FROM orders o WHERE o.id = tickets.order_id AND o.status_order = 'paid')
      RETURNING id, kode_unik, status_tiket, scanned_at, scanned_by`,
        [ticket.ticket_id, req.user.id]
      );

      if (updateResult.rowCount === 0) {
        const current = await pool.query(
          'SELECT status_tiket, scanned_at FROM tickets WHERE id = $1',
          [ticket.ticket_id]
        );
        const row = current.rows[0];
        return res.status(409).json({
          success: false,
          message: row && row.status_tiket === 'scanned' ? 'Tiket sudah dipindai.' : 'Tiket tidak aktif.',
          scanned_at: row && row.scanned_at ? row.scanned_at : null
        });
      }
      const updatedTicket = updateResult.rows[0];

      return res.status(200).json({
        success: true,
        message: 'Check-in berhasil.',
        ticket: {
          id: updatedTicket.id,
          kode_unik: updatedTicket.kode_unik,
          status_tiket: updatedTicket.status_tiket,
          scanned_at: updatedTicket.scanned_at,
          scanned_by: updatedTicket.scanned_by,
          seat: ticket.seat_id ? { id: ticket.seat_id, nomor_kursi: ticket.nomor_kursi } : null,
          category: { id: ticket.category_id, nama_kategori: ticket.nama_kategori }
        },
        event: {
          id: ticket.event_id,
          nama_event: ticket.nama_event,
          waktu_event: ticket.waktu_event,
          status: ticket.event_status,
          venue: ticket.venue_id ? { id: ticket.venue_id, nama_venue: ticket.nama_venue, alamat: ticket.alamat } : null,
          genre: ticket.nama_genre ? { nama_genre: ticket.nama_genre } : null
        }
      });
    } catch (error) {
      mapError(error, res, 'Error in checkIn');
    }
  },

  // Daftar tiket yang dipindai oleh user yang login.
  async getScannedTickets(req, res) {
    try {
      const { page, limit } = req.validated;
      const offset = (page - 1) * limit;

      const countResult = await pool.query(
        "SELECT COUNT(*)::int AS total FROM tickets WHERE scanned_by = $1 AND status_tiket = 'scanned'",
        [req.user.id]
      );
      const total = countResult.rows[0].total;

      const dataResult = await pool.query(
        `SELECT t.id, t.kode_unik, t.status_tiket, t.scanned_at, t.scanned_by,
                s.id AS seat_id, s.nomor_kursi,
                tc.id AS kategori_id, tc.nama_kategori,
                e.id AS event_id, e.nama_event, e.waktu_event
           FROM tickets t
           JOIN ticket_categories tc ON tc.id = t.kategori_id
           JOIN events e ON e.id = tc.event_id
           LEFT JOIN seats s ON s.id = t.seat_id
          WHERE t.scanned_by = $1 AND t.status_tiket = 'scanned'
          ORDER BY t.scanned_at DESC
          LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      return res.status(200).json({
        success: true,
        message: 'Daftar tiket yang dipindai.',
        data: dataResult.rows.map(formatScanRow),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      mapError(error, res, 'Error in getScannedTickets');
    }
  },

  // Semua tiket yang sudah dipindai untuk satu event.
  async getEventScannedTickets(req, res) {
    try {
      const { eventId, page, limit } = req.validated;
      const offset = (page - 1) * limit;

      if (req.user.role === 'Scanner' && !await ScannerAssignment.isAssigned(req.user.id, eventId)) {
        return res.status(403).json({ success: false, message: 'Anda tidak ditugaskan untuk event ini.' });
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM tickets t JOIN ticket_categories tc ON tc.id = t.kategori_id
          WHERE tc.event_id = $1 AND t.status_tiket = 'scanned'`,
        [eventId]
      );
      const total = countResult.rows[0].total;

      // Alamat email scanner TIDAK ikut dikirim (data pribadi yang tidak dibutuhkan untuk daftar ini).
      const dataResult = await pool.query(
        `SELECT t.id, t.kode_unik, t.status_tiket, t.scanned_at, t.scanned_by, u.username,
                s.id AS seat_id, s.nomor_kursi,
                tc.id AS kategori_id, tc.nama_kategori,
                e.id AS event_id, e.nama_event, e.waktu_event
           FROM tickets t
           JOIN ticket_categories tc ON tc.id = t.kategori_id
           JOIN events e ON e.id = tc.event_id
           LEFT JOIN seats s ON s.id = t.seat_id
           LEFT JOIN users u ON u.id = t.scanned_by
          WHERE e.id = $1 AND t.status_tiket = 'scanned'
          ORDER BY t.scanned_at DESC
          LIMIT $2 OFFSET $3`,
        [eventId, limit, offset]
      );

      return res.status(200).json({
        success: true,
        message: 'Daftar tiket yang dipindai untuk event.',
        data: dataResult.rows.map((row) => ({
          ...formatScanRow(row),
          users: row.username ? { username: row.username } : null
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      mapError(error, res, 'Error in getEventScannedTickets');
    }
  },
  async assignScanner(req, res) {
    try {
      const { eventId, scanner_id } = req.validated;
      const assignment = await ScannerAssignment.assign(scanner_id, eventId, req.user.id);
      return res.status(201).json({ success: true, message: 'Scanner ditugaskan ke event.', data: assignment });
    } catch (error) {
      return mapError(error, res, 'Error on assignScanner');
    }
  },

  async unassignScanner(req, res) {
    try {
      const { eventId, scannerId } = req.validated;
      const assignment = await ScannerAssignment.unassign(scannerId, eventId);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Penugasan scanner tidak ditemukan.' });
      }
      return res.status(200).json({ success: true, message: 'Penugasan scanner dicabut.', data: assignment });
    } catch (error) {
      return mapError(error, res, 'Error on unassignScanner');
    }
  }
};

// Bentuk respons dipertahankan (kompatibel dengan frontend yang sudah ada).
function formatScanRow(row) {
  return {
    id: row.id,
    kode_unik: row.kode_unik,
    status_tiket: row.status_tiket,
    scanned_at: row.scanned_at,
    scanned_by: row.scanned_by,
    order_item_seats: {
      seats: {
        id: row.seat_id,
        nomor_kursi: row.nomor_kursi,
        ticket_categories: { id: row.kategori_id, nama_kategori: row.nama_kategori }
      },
      order_items: {
        orders: { id: row.event_id, nama_event: row.nama_event, waktu_event: row.waktu_event }
      }
    }
  };
}

module.exports = scannerController;
