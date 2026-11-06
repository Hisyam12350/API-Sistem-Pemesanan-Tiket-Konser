const express = require('express');
const router = express.Router();
const genresController = require('../controllers/genresController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Daftar genre musik (Publik)
router.get('/', genresController.getAllGenres);

// Detail genre (Publik)
router.get('/:id', genresController.getGenreById);

// Admin & SuperAdmin kelola genre
router.post('/', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), genresController.createGenre);
router.put('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), genresController.updateGenre);
router.delete('/:id', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), genresController.deleteGenre);

module.exports = router;