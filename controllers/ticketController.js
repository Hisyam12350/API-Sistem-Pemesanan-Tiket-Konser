const { generateSVG, generatePNGBuffer } = require('../utils/qrCodeGenerator.js');
const pool = require('../config/db.js');

const Ticket = {
  async findById(id) {
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.order_id, 
        t.kategori_id, 
        t.seat_id, 
        t.kode_unik, 
        t.status_tiket, 
        t.scanned_at, 
        t.scanned_by,
        t.created_at,
        o.cutsomer_id AS customer_id,
        tc.nama_kategori,
        tc.harga,
        s.nomor_kursi,
        e.id AS event_id,
        e.nama_event,
        e.waktu_event,
        e.lokasi
      FROM tickets t
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN ticket_categories tc ON tc.id = t.kategori_id
      LEFT JOIN seats s ON s.id = t.seat_id
      LEFT JOIN events e ON e.id = tc.event_id
      WHERE t.id = $1
    `, [id]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  },

  async findByUser(userId) {
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.order_id, 
        t.kategori_id, 
        t.seat_id, 
        t.kode_unik, 
        t.status_tiket, 
        t.scanned_at,
        tc.nama_kategori,
        s.nomor_kursi,
        e.nama_event,
        e.waktu_event
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      LEFT JOIN ticket_categories tc ON tc.id = t.kategori_id
      LEFT JOIN seats s ON s.id = t.seat_id
      LEFT JOIN events e ON e.id = tc.event_id
      WHERE o.cutsomer_id = $1
      ORDER BY t.id DESC
    `, [userId]);
    return result.rows;
  }
};

const ticketController = {
  async getTicketsByUser(req, res) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized: no token provided' });
      const userId = req.user.id;
      const tickets = await Ticket.findByUser(userId);
      return res.status(200).json({
        success: true,
        data: tickets
      });
    } catch (err) {
      console.error('Get tickets by user failed:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  async getTicketById(req, res) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized: no token provided' });
      const { id } = req.params;
      const ticket = await Ticket.findById(id);

      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket tidak ditemukan.' });
      }

      // Check auth: user must be the ticket buyer (customer) or Admin/SuperAdmin
      const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
      const isOwner = Number(ticket.customer_id) === Number(req.user.id);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Akses ditolak. Anda bukan pemilik tiket ini.' });
      }

      const qrSvg = await generateSVG(ticket.kode_unik, { width: 400, height: 400 });

      return res.status(200).json({
        success: true,
        data: {
          ...ticket,
          qr_code_svg: qrSvg // Embed langsung di frontend
        }
      });
    } catch (err) {
      console.error('Get ticket by ID failed:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  async downloadTicketQR(req, res) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized: no token provided' });
      const { id } = req.params;
      const ticket = await Ticket.findById(id);

      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket tidak ditemukan.' });
      }

      // Check auth: user must be the ticket buyer (customer) or Admin/SuperAdmin
      const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
      const isOwner = Number(ticket.customer_id) === Number(req.user.id);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Akses ditolak. Anda bukan pemilik tiket ini.' });
      }

      const pngBuffer = await generatePNGBuffer(ticket.kode_unik, { width: 500, height: 500 });

      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="ticket-${ticket.kode_unik}.png"`
      });

      res.send(pngBuffer);
    } catch (err) {
      console.error('Download ticket QR failed:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = ticketController;