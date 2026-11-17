const VenueType = require('../models/venueTypes.js');
const { mapError } = require('../utils/httpError.js');

const venueTypeController = {
  getAllTypes: async (req, res) => {
    try {
      const result = await VenueType.getAllTypes();
      res.status(200).json({ success: true, message: 'Daftar tipe tempat', data: result });
    } catch (error) {
      mapError(error, res, 'Error on venue types');
    }
  },

  createType: async (req, res) => {
    try {
      const { nama_tipe, deskripsi, ikon } = req.body;
      if (!nama_tipe || !String(nama_tipe).trim()) {
        return res.status(400).json({ success: false, message: 'nama_tipe wajib diisi.' });
      }
      const result = await VenueType.createType({ nama_tipe: String(nama_tipe).trim(), deskripsi, ikon });
      res.status(201).json({ success: true, message: 'Tipe tempat berhasil dibuat', data: result });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Tipe tempat dengan nama tersebut sudah ada.' });
      }
      mapError(error, res, 'Error on venue types');
    }
  },

  deleteType: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await VenueType.getTypeById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Tipe tempat dengan ID ' + id + ' tidak ditemukan.' });
      }
      const result = await VenueType.deleteType(id);
      res.status(200).json({ success: true, message: 'Tipe tempat berhasil dihapus', data: result });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, message: 'Tipe ini masih dipakai oleh venue dan tidak dapat dihapus.' });
      }
      mapError(error, res, 'Error on venue types');
    }
  },
};

module.exports = venueTypeController;
