const Venue = require('../models/venues.js');
const VenueType = require('../models/venueTypes.js');
const googlePlaces = require('../utils/googlePlacesService.js');
const { classifyVenue } = require('../utils/venueClassifier.js');

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
      const { venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url } = req.body;
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
      const result = await Venue.createVenue({ venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url, sumber_data: 'manual' });
      res.status(201).json({ success: true, message: 'Tempat berhasil dibuat', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updateVenue: async (req, res) => {
    try {
      const { id } = req.params;
      const { venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url } = req.body;
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

  searchGoogle: async (req, res) => {
    try {
      const { input, session_token } = req.body;
      if (!input || !String(input).trim() || !session_token) {
        return res.status(400).json({ success: false, message: 'input dan session_token wajib diisi. Gunakan 1 session_token yang sama selama 1 sesi mengetik.' });
      }
      const suggestions = await googlePlaces.autocomplete({ input: String(input).trim(), sessionToken: session_token });
      res.status(200).json({ success: true, message: 'Saran tempat dari Google Maps', data: suggestions });
    } catch (error) {
      res.status(toStatusCode(error)).json({ success: false, message: error.message });
    }
  },

  saveFromGoogle: async (req, res) => {
    try {
      const { place_id, venue_type_id } = req.body;
      if (!place_id) {
        return res.status(400).json({ success: false, message: 'place_id wajib diisi.' });
      }
      const sudahAda = await Venue.findByGooglePlaceId(place_id);
      if (sudahAda) {
        return res.status(200).json({ success: true, message: 'Tempat ini sudah tersimpan sebelumnya.', data: sudahAda, sudah_ada: true });
      }
      const detail = await googlePlaces.getPlaceDetails(place_id);
      if (!detail.nama || !detail.alamat) {
        return res.status(502).json({ success: false, message: 'Google tidak mengembalikan nama/alamat lengkap untuk tempat ini.' });
      }
      let tipeFinalId = venue_type_id;
      let klasifikasi = null;
      if (!tipeFinalId) {
        const tipeList = await VenueType.getAllTypes();
        klasifikasi = classifyVenue({ googleTypes: detail.types, name: detail.nama, address: detail.alamat }, tipeList);
        if (!klasifikasi) {
          return res.status(422).json({
            success: false,
            message: 'Tipe tempat tidak dapat dikenali otomatis. Pilih venue_type_id secara manual.',
            butuh_klasifikasi_manual: true,
            detail_google: { place_id: detail.place_id, nama: detail.nama, alamat: detail.alamat, kota: detail.kota, types: detail.types },
          });
        }
        tipeFinalId = klasifikasi.venue_type_id;
      } else {
        const tipe = await VenueType.getTypeById(venue_type_id);
        if (!tipe) {
          return res.status(404).json({ success: false, message: 'Tipe tempat dengan ID ' + venue_type_id + ' tidak ditemukan.' });
        }
      }
      const result = await Venue.createVenue({
        venue_type_id: tipeFinalId,
        nama_venue: detail.nama,
        alamat: detail.alamat,
        kota: detail.kota,
        kapasitas: null,
        gambar_url: null,
        google_place_id: detail.place_id,
        latitude: detail.latitude,
        longitude: detail.longitude,
        sumber_data: 'google',
      });
      res.status(201).json({ success: true, message: 'Tempat dari Google Maps berhasil disimpan', data: result, klasifikasi });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Tempat ini sudah tersimpan (duplikat place_id).' });
      }
      res.status(toStatusCode(error)).json({ success: false, message: error.message });
    }
  },
};

module.exports = venuesController;
