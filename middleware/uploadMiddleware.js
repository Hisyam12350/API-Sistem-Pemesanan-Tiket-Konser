const multer = require('multer');

// Simpan file di memory buffer agar bisa di-stream/upload langsung ke Supabase Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Batas maksimal ukuran file: 5 MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (JPG, PNG, WEBP, GIF, dll) yang diperbolehkan!'), false);
    }
  }
});

module.exports = upload;
