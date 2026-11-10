const supabase = require('../config/supabase');
const pool = require('../config/db');

const scannerController = {
  async checkIn(req, res) {
    try {
      const { kode_unik } = req.validated;

      const query = `
        SELECT
          t.id as ticket_id,
          t.kode_unik,
          t.status_tiket,
          t.scanned_at,
          t.scanned_by,
          s.id as seat_id,
          s.nomor_kursi,
          s.kategori_id,
          tc.id as category_id,
          tc.nama_kategori,
          e.id as event_id,
          e.nama_event,
          e.waktu_event,
          e.status as event_status,
          e.venue_id,
          g.nama_genre,
          v.nama_venue,
          v.alamat,
          o.id as order_id,
          o.status_order,
          o.batas_waktu_bayar
        FROM tickets t
        JOIN seats s ON s.id = t.seat_id
        JOIN order_item_seats ois ON ois.seat_id = s.id
        JOIN order_items oi ON oi.id = ois.order_item_id
        JOIN ticket_categories tc ON tc.id = oi.kategori_id
        JOIN events e ON e.id = tc.event_id
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN genres g ON g.id = e.genre_id
        LEFT JOIN venues v ON v.id = e.venue_id
        WHERE t.kode_unik = $1
      `;
      const result = await pool.query(query, [kode_unik]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tiket tidak ditemukan.'
        });
      }

      const ticket = result.rows[0];

      if (ticket.status_tiket !== 'active') {
        return res.status(409).json({
          success: false,
          message: `Tiket sudah ${ticket.status_tiket === 'scanned' ? 'dipindai' : 'tidak aktif'}.`
        });
      }

      if (!['upcoming', 'ongoing'].includes(ticket.event_status)) {
        return res.status(409).json({
          success: false,
          message: 'Event tidak dalam status yang memungkinkan check-in.'
        });
      }

      const now = new Date();
      const eventTime = new Date(ticket.waktu_event);
      if (eventTime < now && ticket.event_status !== 'ongoing') {
        return res.status(409).json({
          success: false,
          message: 'Event telah berakhir.'
        });
      }

      const { data: updatedTicket, error: updateError } = await supabase
        .from('tickets')
        .update({
          status_tiket: 'scanned',
          scanned_at: new Date().toISOString(),
          scanned_by: req.user.id
        })
        .eq('id', ticket.ticket_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating ticket:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Gagal memperbarui status tiket.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Check-in berhasil.',
        ticket: {
          id: updatedTicket.id,
          kode_unik: updatedTicket.kode_unik,
          status_tiket: updatedTicket.status_tiket,
          scanned_at: updatedTicket.scanned_at,
          scanned_by: updatedTicket.scanned_by,
          seat: {
            id: ticket.seat_id,
            nomor_kursi: ticket.nomor_kursi,
            kategori_id: ticket.kategori_id
          },
          category: {
            id: ticket.category_id,
            nama_kategori: ticket.nama_kategori
          }
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
      console.error('Error in checkIn:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server.',
        error: error.message
      });
    }
  },

  async getScannedTickets(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      const lim = Math.min(Number(limit), 100);
      const off = Number(offset);

      // Use pg pool for complex join query
      // Join path: tickets -> seats -> order_item_seats -> order_items -> ticket_categories -> events
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tickets t
        JOIN seats s ON s.id = t.seat_id
        JOIN order_item_seats ois ON ois.seat_id = s.id
        JOIN order_items oi ON oi.id = ois.order_item_id
        JOIN ticket_categories tc ON tc.id = oi.kategori_id
        JOIN events e ON e.id = tc.event_id
        WHERE t.scanned_by = $1 AND t.status_tiket = 'scanned'
      `;
      const countResult = await pool.query(countQuery, [req.user.id]);
      const total = parseInt(countResult.rows[0].total, 10);

      const dataQuery = `
        SELECT
          t.id,
          t.kode_unik,
          t.status_tiket,
          t.scanned_at,
          t.scanned_by,
          s.id as seat_id,
          s.nomor_kursi,
          tc.id as kategori_id,
          tc.nama_kategori,
          e.id as event_id,
          e.nama_event,
          e.waktu_event
        FROM tickets t
        JOIN seats s ON s.id = t.seat_id
        JOIN order_item_seats ois ON ois.seat_id = s.id
        JOIN order_items oi ON oi.id = ois.order_item_id
        JOIN ticket_categories tc ON tc.id = oi.kategori_id
        JOIN events e ON e.id = tc.event_id
        WHERE t.scanned_by = $1 AND t.status_tiket = 'scanned'
        ORDER BY t.scanned_at DESC
        LIMIT $2 OFFSET $3
      `;
      const dataResult = await pool.query(dataQuery, [req.user.id, lim, off]);

      const tickets = dataResult.rows.map(row => ({
        id: row.id,
        kode_unik: row.kode_unik,
        status_tiket: row.status_tiket,
        scanned_at: row.scanned_at,
        scanned_by: row.scanned_by,
        order_item_seats: {
          seats: {
            id: row.seat_id,
            nomor_kursi: row.nomor_kursi,
            ticket_categories: {
              id: row.kategori_id,
              nama_kategori: row.nama_kategori
            }
          },
          order_items: {
            orders: {
              id: row.event_id,
              nama_event: row.nama_event,
              waktu_event: row.waktu_event
            }
          }
        }
      }));

      return res.status(200).json({
        success: true,
        message: 'Daftar tiket yang dipindai.',
        data: tickets,
        pagination: {
          page: Number(page),
          limit: lim,
          total,
          totalPages: Math.ceil(total / lim)
        }
      });
    } catch (error) {
      console.error('Error in getScannedTickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server.',
        error: error.message
      });
    }
  },

  async getEventScannedTickets(req, res) {
    try {
      const { eventId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;
      const lim = Math.min(Number(limit), 100);
      const off = Number(offset);

      // Use pg pool for complex join query
      // Join path: tickets -> seats -> order_item_seats -> order_items -> ticket_categories -> events
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tickets t
        JOIN seats s ON s.id = t.seat_id
        JOIN order_item_seats ois ON ois.seat_id = s.id
        JOIN order_items oi ON oi.id = ois.order_item_id
        JOIN ticket_categories tc ON tc.id = oi.kategori_id
        WHERE tc.event_id = $1 AND t.status_tiket = 'scanned'
      `;
      const countResult = await pool.query(countQuery, [eventId]);
      const total = parseInt(countResult.rows[0].total, 10);

      const dataQuery = `
        SELECT
          t.id,
          t.kode_unik,
          t.status_tiket,
          t.scanned_at,
          t.scanned_by,
          u.username,
          u.email,
          s.id as seat_id,
          s.nomor_kursi,
          tc.id as kategori_id,
          tc.nama_kategori,
          e.id as event_id,
          e.nama_event
        FROM tickets t
        JOIN seats s ON s.id = t.seat_id
        JOIN order_item_seats ois ON ois.seat_id = s.id
        JOIN order_items oi ON oi.id = ois.order_item_id
        JOIN ticket_categories tc ON tc.id = oi.kategori_id
        JOIN events e ON e.id = tc.event_id
        LEFT JOIN users u ON u.id = t.scanned_by
        WHERE e.id = $1 AND t.status_tiket = 'scanned'
        ORDER BY t.scanned_at DESC
        LIMIT $2 OFFSET $3
      `;
      const dataResult = await pool.query(dataQuery, [eventId, lim, off]);

      const tickets = dataResult.rows.map(row => ({
        id: row.id,
        kode_unik: row.kode_unik,
        status_tiket: row.status_tiket,
        scanned_at: row.scanned_at,
        scanned_by: row.scanned_by,
        users: row.username ? { username: row.username, email: row.email } : null,
        order_item_seats: {
          seats: {
            id: row.seat_id,
            nomor_kursi: row.nomor_kursi,
            ticket_categories: {
              id: row.kategori_id,
              nama_kategori: row.nama_kategori
            }
          },
          order_items: {
            orders: {
              id: row.event_id,
              nama_event: row.nama_event
            }
          }
        }
      }));

      return res.status(200).json({
        success: true,
        message: 'Daftar tiket yang dipindai untuk event.',
        data: tickets,
        pagination: {
          page: Number(page),
          limit: lim,
          total,
          totalPages: Math.ceil(total / lim)
        }
      });
    } catch (error) {
      console.error('Error in getEventScannedTickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server.',
        error: error.message
      });
    }
  }
};

module.exports = scannerController;