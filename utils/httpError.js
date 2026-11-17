const { logger } = require('./logger');

// Satu tempat untuk memetakan error -> respons HTTP.
// Tujuan: pesan internal (nama tabel/kolom, detail SQL, stack) TIDAK pernah dikirim ke klien di produksi.
const isProduction = () => process.env.NODE_ENV === 'production';

// Kode error PostgreSQL yang aman dijadikan 409 (konflik data), beserta pesan generik
// yang tidak membocorkan nama constraint/tabel.
const PG_CONFLICT_MESSAGES = {
  '23505': 'Data sudah ada atau bentrok dengan data lain (duplikat).',
  '23503': 'Data tidak dapat diubah/dihapus karena masih dipakai oleh data lain.',
  '23514': 'Data tidak memenuhi aturan validasi.'
};

/**
 * Kirim respons 500 generik. Detail error hanya dicatat ke log (dan dikirim ke klien hanya bila NODE_ENV=development).
 */
function serverError(res, error, context = 'Unhandled error', message = 'Terjadi kesalahan pada server.') {
  logger.error({ err: error && error.message, stack: error && error.stack }, context);
  const body = { success: false, message };
  // Detail error hanya dikirim bila NODE_ENV=development SECARA EKSPLISIT. (Jika NODE_ENV lupa di-set di server,
  // default-nya aman: tidak ada detail yang bocor.)
  if (process.env.NODE_ENV === 'development' && error && error.message) body.error = error.message;
  return res.status(500).json(body);
}

/**
 * Pemetaan error standar untuk controller:
 *  - error.status (dibuat sengaja oleh kode kita)   -> status itu + pesannya
 *  - P0001 (RAISE EXCEPTION dari trigger kita)       -> 409 + pesan trigger (memang ditulis untuk user)
 *  - 23505/23503/23514 (pelanggaran constraint)      -> 409 / 400 + pesan generik
 *  - lainnya                                          -> 500 generik
 */
function mapError(error, res, context = 'Request error') {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (error && error.code === 'P0001') {
    return res.status(409).json({ success: false, message: error.message || 'Konflik data.' });
  }
  if (error && PG_CONFLICT_MESSAGES[error.code]) {
    const status = error.code === '23514' ? 400 : 409;
    return res.status(status).json({ success: false, message: PG_CONFLICT_MESSAGES[error.code] });
  }
  return serverError(res, error, context);
}

module.exports = { mapError, serverError, isProduction };
