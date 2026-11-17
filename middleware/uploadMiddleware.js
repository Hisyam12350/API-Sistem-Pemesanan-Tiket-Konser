const multer = require('multer');

// Hanya format gambar raster yang aman. SVG sengaja TIDAK diizinkan (bisa memuat <script> => XSS
// ketika dibuka langsung dari URL storage). Isi file diverifikasi lagi lewat magic bytes di storageService.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // maksimal 5 MB
    files: 1,
    fields: 30
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Hanya file gambar JPG, PNG, atau WEBP yang diperbolehkan.');
      err.status = 400;
      cb(err, false);
    }
  }
});

module.exports = upload;
