const Event = require('../models/events.js');
const storageService = require('../utils/storageService.js');

const eventController = {
  getAllEvents: async (req, res) => {
    try {
      const result = await Event.getAllEvents();
      res.status(200).json({ success: true, message: "Daftar semua event", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getEventById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await Event.getEventById(id);

      if (!result) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      res.status(200).json({ success: true, message: "Detail event", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  createEvents: async (req, res) => {
    try {
      const { nama_event, lokasi, waktu_event, status, venue_id, deskripsi, detail_lokasi } = req.body;
      let banner_url = req.body.banner_url || null;

      if (!nama_event || !waktu_event) {
        return res.status(400).json({
          success: false,
          message: 'nama_event dan waktu_event wajib diisi.'
        });
      }

      // MODE VENUE (Step 1): venue_id diberikan -> validasi venue & auto-isi lokasi dari venue bila kosong
      let finalLokasi = lokasi;
      if (venue_id !== undefined && venue_id !== null && venue_id !== '') {
        const Venue = require('../models/venues.js');
        const venue = await Venue.getVenueById(venue_id);
        if (!venue) {
          return res.status(404).json({
            success: false,
            message: 'Tempat (venue) dengan ID ' + venue_id + ' tidak ditemukan.'
          });
        }
        if (!finalLokasi) {
          finalLokasi = venue.alamat
            ? venue.nama_venue + ', ' + venue.alamat
            : venue.nama_venue;
        }
      } else if (!finalLokasi) {
        // MODE MANUAL: tanpa venue, lokasi wajib diketik manual (kompatibel event lama)
        return res.status(400).json({
          success: false,
          message: 'lokasi wajib diisi bila tidak memilih venue.'
        });
      }

      // Upload file banner ke Supabase Storage jika ada file yang diunggah
      if (req.file) {
        banner_url = await storageService.uploadFile(req.file, 'events', 'banners');
      }

      const result = await Event.createEvents({ nama_event, lokasi: finalLokasi, waktu_event, banner_url, status, venue_id: venue_id || null, deskripsi, detail_lokasi });
      res.status(201).json({ success: true, message: "Event berhasil dibuat", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updateEvents: async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_event, lokasi, waktu_event, status, venue_id, deskripsi, detail_lokasi } = req.body;

      const existing = await Event.getEventById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      let banner_url = req.body.banner_url || existing.banner_url;

      // Jika pengguna mengunggah gambar baru
      if (req.file) {
        // Hapus banner lama dari Supabase Storage jika ada
        if (existing.banner_url) {
          await storageService.deleteFile(existing.banner_url, 'events');
        }
        // Upload banner baru
        banner_url = await storageService.uploadFile(req.file, 'events', 'banners');
      }

      // Ganti venue: validasi venue baru & auto-isi lokasi dari venue bila lokasi tidak dikirim
      let finalLokasi = lokasi;
      let finalVenueId = venue_id;
      if (venue_id !== undefined) {
        if (venue_id === null || venue_id === '') {
          finalVenueId = null;
        } else {
          const Venue = require('../models/venues.js');
          const venue = await Venue.getVenueById(venue_id);
          if (!venue) {
            return res.status(404).json({
              success: false,
              message: 'Tempat (venue) dengan ID ' + venue_id + ' tidak ditemukan.'
            });
          }
          finalVenueId = venue.id;
          if (finalLokasi === undefined || finalLokasi === null || finalLokasi === '') {
            if (!existing.venue_id || Number(existing.venue_id) !== Number(venue.id)) {
              finalLokasi = venue.nama_venue + ', ' + venue.alamat;
            } else {
              finalLokasi = undefined;
            }
          }
        }
      }

      const result = await Event.updateEvents(id, { nama_event, lokasi: finalLokasi, waktu_event, banner_url, status, venue_id: finalVenueId, deskripsi, detail_lokasi });
      res.status(200).json({ success: true, message: "Event berhasil diperbarui", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  deleteEvents: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Event.getEventById(id);

      if (!existing) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      // Hapus file banner dari Supabase Storage
      if (existing.banner_url) {
        await storageService.deleteFile(existing.banner_url, 'events');
      }

      const result = await Event.deleteEvents(id);
      res.status(200).json({ success: true, message: "Event berhasil dihapus", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = eventController;
