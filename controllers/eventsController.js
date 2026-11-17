const Event = require('../models/events.js');
const storageService = require('../utils/storageService.js');
const pool = require('../config/db.js');
const Venue = require('../models/venues.js');
const Genre = require('../models/genres.js');
const { mapError } = require('../utils/httpError.js');

const EVENT_BUCKET = 'events';

const eventController = {
  getAllEvents: async (req, res) => {
    try {
      const result = await Event.getAllEvents();
      res.status(200).json({ success: true, message: "Daftar semua event", data: result });
    } catch (error) {
      mapError(error, res, 'Error on events');
    }
  },

  getEventById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await Event.getEventWithVenue(id);

      if (!result) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      res.status(200).json({ success: true, message: "Detail event", data: result });
    } catch (error) {
      mapError(error, res, 'Error on events');
    }
  },

  createEvents: async (req, res) => {
    try {
      const { nama_event, lokasi, waktu_event, status, venue_id, genre_id, deskripsi, detail_lokasi } = req.validated || req.body;
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

      // Validasi genre jika diberikan
      if (genre_id !== undefined && genre_id !== null && genre_id !== '') {
        const genre = await Genre.getGenreById(genre_id);
        if (!genre) {
          return res.status(404).json({
            success: false,
            message: 'Genre dengan ID ' + genre_id + ' tidak ditemukan.'
          });
        }
      }

      // Upload dilakukan SETELAH semua validasi lolos; bila insert gagal, file yang baru diunggah dibersihkan
      // agar tidak jadi file yatim di storage.
      if (req.file) {
        banner_url = await storageService.uploadFile(req.file, EVENT_BUCKET, 'banners');
      }

      let result;
      try {
        result = await Event.createEvents({ nama_event, lokasi: finalLokasi, waktu_event, banner_url, status, venue_id: venue_id || null, genre_id: genre_id || null, deskripsi, detail_lokasi });
      } catch (dbErr) {
        if (req.file && banner_url) await storageService.deleteFile(banner_url, EVENT_BUCKET);
        throw dbErr;
      }
      res.status(201).json({ success: true, message: "Event berhasil dibuat", data: result });
    } catch (error) {
      mapError(error, res, 'Error on events');
    }
  },

  updateEvents: async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_event, lokasi, waktu_event, status, venue_id, genre_id, deskripsi, detail_lokasi } = req.validated || req.body;

      const existing = await Event.getEventById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      // Ganti venue: validasi venue baru & auto-isi lokasi dari venue bila lokasi tidak dikirim
      let finalLokasi = lokasi;
      let finalVenueId = venue_id;
      if (venue_id !== undefined) {
        if (venue_id === null || venue_id === '') {
          finalVenueId = null;
        } else {
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

      // Validasi genre jika diberikan
      if (genre_id !== undefined && genre_id !== null && genre_id !== '') {
        const genre = await Genre.getGenreById(genre_id);
        if (!genre) {
          return res.status(404).json({
            success: false,
            message: 'Genre dengan ID ' + genre_id + ' tidak ditemukan.'
          });
        }
      }

      // genre_id: undefined = tidak diubah; null/'' = hapus genre; angka = ganti. (Sebelumnya `genre_id || null`
      // menghapus genre setiap kali field ini tidak dikirim.)
      const finalGenreId = genre_id === undefined ? undefined : (genre_id === '' ? null : genre_id);

      // Urutan aman: upload baru -> update DB -> baru hapus banner lama. Bila DB gagal, banner baru dibersihkan
      // dan banner lama tetap utuh (sebelumnya banner lama dihapus lebih dulu sehingga bisa hilang tanpa ganti).
      let banner_url = req.validated && req.validated.banner_url !== undefined ? req.validated.banner_url : undefined;
      let uploaded = null;
      if (req.file) {
        uploaded = await storageService.uploadFile(req.file, EVENT_BUCKET, 'banners');
        banner_url = uploaded;
      }

      let result;
      try {
        result = await Event.updateEvents(id, { nama_event, lokasi: finalLokasi, waktu_event, banner_url, status, venue_id: finalVenueId, genre_id: finalGenreId, deskripsi, detail_lokasi });
      } catch (dbErr) {
        if (uploaded) await storageService.deleteFile(uploaded, EVENT_BUCKET);
        throw dbErr;
      }
      if (uploaded && existing.banner_url) {
        await storageService.deleteFile(existing.banner_url, EVENT_BUCKET);
      }
      res.status(200).json({ success: true, message: "Event berhasil diperbarui", data: result });
    } catch (error) {
      mapError(error, res, 'Error on events');
    }
  },

  deleteEvents: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Event.getEventById(id);

      if (!existing) {
        return res.status(404).json({ success: false, message: `Event dengan ID ${id} tidak ditemukan.` });
      }

      // Event yang sudah punya order tidak boleh dihapus: order/tiket/pembayaran terkait akan ikut terhapus
      // (ON DELETE CASCADE) dan pembeli kehilangan tiketnya. Ubah status event jika ingin menutup.
      const used = await pool.query(
        `SELECT 1 FROM order_items oi JOIN ticket_categories tc ON tc.id = oi.kategori_id
          WHERE tc.event_id = $1 LIMIT 1`,
        [id]
      );
      if (used.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Event tidak dapat dihapus karena sudah memiliki order/tiket. Ubah status event menjadi completed.' });
      }

      const result = await Event.deleteEvents(id);
      // Banner dihapus SETELAH baris event berhasil dihapus (bukan sebelum).
      if (existing.banner_url) {
        await storageService.deleteFile(existing.banner_url, EVENT_BUCKET);
      }
      res.status(200).json({ success: true, message: "Event berhasil dihapus", data: result });
    } catch (error) {
      mapError(error, res, 'Error on events');
    }
  }
};

module.exports = eventController;
