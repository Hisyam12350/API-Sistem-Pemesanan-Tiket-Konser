const Genre = require('../models/genres.js');

const genresController = {
  getAllGenres: async (req, res) => {
    try {
      const result = await Genre.getAllGenres();
      res.status(200).json({ success: true, message: 'Daftar genre musik', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getGenreById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await Genre.getGenreById(id);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Genre dengan ID ' + id + ' tidak ditemukan.' });
      }
      res.status(200).json({ success: true, message: 'Detail genre', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  createGenre: async (req, res) => {
    try {
      const { nama_genre, deskripsi } = req.body;
      if (!nama_genre || !String(nama_genre).trim()) {
        return res.status(400).json({ success: false, message: 'nama_genre wajib diisi.' });
      }
      const result = await Genre.createGenre({ nama_genre: String(nama_genre).trim(), deskripsi });
      res.status(201).json({ success: true, message: 'Genre berhasil dibuat', data: result });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Genre dengan nama tersebut sudah ada.' });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updateGenre: async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_genre, deskripsi } = req.body;
      const existing = await Genre.getGenreById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Genre dengan ID ' + id + ' tidak ditemukan.' });
      }
      const result = await Genre.updateGenre(id, { nama_genre, deskripsi });
      res.status(200).json({ success: true, message: 'Genre berhasil diperbarui', data: result });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Genre dengan nama tersebut sudah ada.' });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  },

  deleteGenre: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Genre.getGenreById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Genre dengan ID ' + id + ' tidak ditemukan.' });
      }
      const result = await Genre.deleteGenre(id);
      res.status(200).json({ success: true, message: 'Genre berhasil dihapus', data: result });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, message: 'Genre ini masih dipakai oleh event dan tidak dapat dihapus.' });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

module.exports = genresController;