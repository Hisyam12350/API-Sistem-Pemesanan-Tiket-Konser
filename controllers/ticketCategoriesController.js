const TicketCategory = require('../models/ticketCategories.js');
const Event = require('../models/events.js');

const ticketCategoryController = {
  // GET /api/ticket-categories?event_id=
  getAllCategories: async (req, res) => {
    try {
      const { event_id } = req.query;
      const result = await TicketCategory.getAllCategories(event_id);
      res.status(200).json({ success: true, message: "Daftar kategori tiket", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // GET /api/ticket-categories/:id
  getCategoryById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await TicketCategory.getCategoryById(id);

      if (!result) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${id} tidak ditemukan.` });
      }

      res.status(200).json({ success: true, message: "Detail kategori tiket", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // POST /api/ticket-categories (Admin/SuperAdmin)
  createCategory: async (req, res) => {
    try {
      const { event_id, nama_kategori, harga, kuota_total } = req.body;

      if (!event_id || !nama_kategori || harga === undefined || kuota_total === undefined) {
        return res.status(400).json({
          success: false,
          message: 'event_id, nama_kategori, harga, dan kuota_total wajib diisi.'
        });
      }

      if (Number(harga) < 0) {
        return res.status(400).json({ success: false, message: 'harga tidak boleh negatif.' });
      }

      if (!Number.isInteger(Number(kuota_total)) || Number(kuota_total) <= 0) {
        return res.status(400).json({ success: false, message: 'kuota_total harus berupa bilangan bulat positif.' });
      }

      // Pastikan event-nya ada
      const event = await Event.getEventById(event_id);
      if (!event) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${event_id} tidak ditemukan.` });
      }

      const result = await TicketCategory.createCategory({
        event_id,
        nama_kategori,
        harga: Number(harga),
        kuota_total: Number(kuota_total)
      });

      res.status(201).json({ success: true, message: "Kategori tiket berhasil dibuat", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // PUT /api/ticket-categories/:id (Admin/SuperAdmin)
  updateCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_kategori, harga, kuota_total } = req.body;

      const existing = await TicketCategory.getCategoryById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${id} tidak ditemukan.` });
      }

      if (harga !== undefined && Number(harga) < 0) {
        return res.status(400).json({ success: false, message: 'harga tidak boleh negatif.' });
      }

      if (kuota_total !== undefined && (!Number.isInteger(Number(kuota_total)) || Number(kuota_total) <= 0)) {
        return res.status(400).json({ success: false, message: 'kuota_total harus berupa bilangan bulat positif.' });
      }

      const result = await TicketCategory.updateCategory(id, {
        nama_kategori,
        harga: harga !== undefined ? Number(harga) : undefined,
        kuota_total: kuota_total !== undefined ? Number(kuota_total) : undefined
      });

      res.status(200).json({ success: true, message: "Kategori tiket berhasil diperbarui", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // DELETE /api/ticket-categories/:id (Admin/SuperAdmin)
  deleteCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await TicketCategory.getCategoryById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${id} tidak ditemukan.` });
      }

      const result = await TicketCategory.deleteCategory(id);
      res.status(200).json({ success: true, message: "Kategori tiket berhasil dihapus", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = ticketCategoryController;
