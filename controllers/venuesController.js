const Venue = require('../models/venues.js');
const VenueType = require('../models/venueTypes.js');
const storageService = require('../utils/storageService');
const { mapError } = require('../utils/httpError.js');

const VENUE_BUCKET = 'venues';

const venuesController = {
  getVenues: async (req, res) => {
    try {
      const { venue_type_id, search, kota, page, limit } = req.query;
      const result = await Venue.getVenues({ venue_type_id, search, kota, page, limit });
      res.status(200).json({ success: true, message: 'Daftar tempat', data: result.data, pagination: result.pagination });
    } catch (error) {
      mapError(error, res, 'Error on venues');
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
      mapError(error, res, 'Error on venues');
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

      const tipe = await VenueType.getTypeById(venue_type_id);
      if (!tipe) {
        return res.status(404).json({ success: false, message: 'Tipe tempat dengan ID ' + venue_type_id + ' tidak ditemukan.' });
      }
      if (req.file) {
        gambar_url = await storageService.uploadFile(req.file, VENUE_BUCKET, 'venues');
      }
      let result;
      try {
        result = await Venue.createVenue({ venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url });
      } catch (dbErr) {
        if (gambar_url) await storageService.deleteFile(gambar_url, VENUE_BUCKET);
        throw dbErr;
      }
      res.status(201).json({ success: true, message: 'Tempat berhasil dibuat', data: result });
    } catch (error) {
      mapError(error, res, 'Error on venues');
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

      // Upload baru -> update DB -> hapus gambar lama (gambar lama tidak hilang bila update gagal)
      let uploaded = null;
      if (req.file) {
        uploaded = await storageService.uploadFile(req.file, VENUE_BUCKET, 'venues');
        gambar_url = uploaded;
      } else {
        gambar_url = existing.gambar_url;
      }

      let result;
      try {
        result = await Venue.updateVenue(id, { venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url });
      } catch (dbErr) {
        if (uploaded) await storageService.deleteFile(uploaded, VENUE_BUCKET);
        throw dbErr;
      }
      if (uploaded && existing.gambar_url) {
        await storageService.deleteFile(existing.gambar_url, VENUE_BUCKET);
      }
      res.status(200).json({ success: true, message: 'Tempat berhasil diperbarui', data: result });
    } catch (error) {
      mapError(error, res, 'Error on venues');
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
      if (existing.gambar_url) {
        await storageService.deleteFile(existing.gambar_url, VENUE_BUCKET);
      }
      res.status(200).json({ success: true, message: 'Tempat berhasil dihapus', data: result });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, message: 'Tempat ini masih dipakai oleh event dan tidak dapat dihapus.' });
      }
      mapError(error, res, 'Error on venues');
    }
  },
};

module.exports = venuesController;
