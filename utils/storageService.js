const crypto = require('crypto');
const supabase = require('../config/supabase');
const { logger } = require('./logger');

// Deteksi tipe gambar dari ISI file (magic bytes), bukan dari nama/Content-Type kiriman klien
// yang bisa dipalsukan. Hanya JPEG, PNG, dan WEBP yang diterima.
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

const storageService = {
  detectImageType,

  /**
   * Upload file dari Multer req.file ke Supabase Storage.
   * Nama file dibuat acak (crypto) dan ekstensi diambil dari tipe yang TERDETEKSI, bukan dari nama asli.
   * @returns {Promise<string|null>} Public URL file yang di-upload
   */
  async uploadFile(file, bucketName, folder = 'banners') {
    if (!file) return null;
    if (!bucketName) throw new Error('bucketName wajib diisi');

    const type = detectImageType(file.buffer);
    if (!type) {
      const err = new Error('Isi file bukan gambar JPG/PNG/WEBP yang valid.');
      err.status = 400;
      throw err;
    }

    const fileName = `${folder}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${type.ext}`;

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file.buffer, { contentType: type.mime, upsert: false });

    if (error) {
      logger.error({ err: error.message, bucketName }, 'Supabase Storage upload gagal');
      const err = new Error('Gagal mengunggah gambar. Silakan coba lagi.');
      err.status = 502;
      throw err;
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  },

  /**
   * Hapus file dari Supabase Storage berdasarkan Public URL. Best-effort: kegagalan hanya dicatat.
   */
  async deleteFile(publicUrl, bucketName) {
    if (!publicUrl || !bucketName) return;

    try {
      const marker = `/${bucketName}/`;
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return;
      const filePath = decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
      await supabase.storage.from(bucketName).remove([filePath]);
    } catch (err) {
      logger.warn({ err: err.message, bucketName }, 'Gagal menghapus file dari Supabase Storage');
    }
  }
};

module.exports = storageService;
