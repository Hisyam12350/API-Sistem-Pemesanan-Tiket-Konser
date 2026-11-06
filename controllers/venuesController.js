const Venue = require('../models/venues.js');
const VenueType = require('../models/venueTypes.js');
const storageService = require('../utils/storageService');

function toStatusCode(error, fallback = 500) {
  return Number.isInteger(error.statusCode) ? error.statusCode : fallback;
}

const venuesController = {
  getVenues: async (req, res) => {
    try {
      const { venue_type_id, search, kota, page, limit } = req.query;
      const result = await Venue.getVenues({ venue_type_id, search, kota, page, limit });
      res.status(200).json({ success: true, message: 'Daftar tempat', data: result.data, pagination: result.pagination });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getVenueById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await Venue.getVenueById(id);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Tempat dengan ID ' + id + ' tidak ditemukan.' });
      }
      res.status(200).json({ success: true, message: 'Detail tempat', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  createVenue: async (req, res) => {
    try {
      const body = req.body || {};
      const { venue_type_id, nama_venue, alamat, kota, kapasitas } = body;
      let gambar_url = null;

      if (!venue_type_id || !nama_venue || !alamat) {
        return res.status(400).json({ success: false, message: 'venue_type_id, nama_venue, dan alamat wajib diisi.' });
      }
      if (kapasitas !== undefined && kapasitas !== null && (isNaN(Number(kapasitas)) || Number(kapasitas) <= 0)) {
        return res.status(400).json({ success: false, message: 'kapasitas harus berupa angka lebih besar dari 0.' });
      }

      // Upload gambar ke Supabase Storage jika ada file yang diunggah
      if (req.file) {
        gambar_url = await storageService.uploadFile(req.file, 'venues', 'venues');
      }

      const tipe = await VenueType.getTypeById(venue_type_id);
      if (!tipe) {
        return res.status(404).json({ success: false, message: 'Tipe tempat dengan ID ' + venue_type_id + ' tidak ditemukan.' });
      }
      const result = await Venue.createVenue({ venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url });
      res.status(201).json({ success: true, message: 'Tempat berhasil dibuat', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updateVenue: async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const { venue_type_id, nama_venue, alamat, kota, kapasitas } = body;
      let gambar_url = null;
      const existing = await Venue.getVenueById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Tempat dengan ID ' + id + ' tidak ditemukan.' });
      }
      if (venue_type_id !== undefined) {
        const tipe = await VenueType.getTypeById(venue_type_id);
        if (!tipe) {
          return res.status(404).json({ success: false, message: 'Tipe tempat dengan ID ' + venue_type_id + ' tidak ditemukan.' });
        }
      }
      if (kapasitas !== undefined && kapasitas !== null && (isNaN(Number(kapasitas)) || Number(kapasitas) <= 0)) {
        return res.status(400).json({ success: false, message: 'kapasitas harus berupa angka lebih besar dari 0.' });
      }

      // Upload gambar baru atau hapus gambar lama jika ada file baru
      if (req.file) {
        if (existing.gambar_url) {
          await storageService.deleteFile(existing.gambar_url, 'venues');
        }
        gambar_url = await storageService.uploadFile(req.file, 'venues', 'venues');
      } else {
        gambar_url = existing.gambar_url;
      }

      const result = await Venue.updateVenue(id, { venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url });
      res.status(200).json({ success: true, message: 'Tempat berhasil diperbarui', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  deleteVenue: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Venue.getVenueById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Tempat dengan ID ' + id + ' tidak ditemukan.' });
      }
      const result = await Venue.deleteVenue(id);
      res.status(200).json({ success: true, message: 'Tempat berhasil dihapus', data: result });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, message: 'Tempat ini masih dipakai oleh event dan tidak dapat dihapus.' });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

module.exports = venuesController;
