require('dotenv').config();
const { validateEnv } = require('./config/envValidation');
validateEnv();

const express = require('express');

const { globalLimiter, authLimiter, seatLockLimiter, paymentCreateLimiter, seatGenerateLimiter } = require('./middleware/rateLimiter');
const corsMiddleware = require('./middleware/corsMiddleware');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const ticketCategoryRoutes = require('./routes/ticketCategoryRoutes');
const seatRoutes = require('./routes/seatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const venueTypeRoutes = require('./routes/venueTypeRoutes');
const venueRoutes = require('./routes/venueRoutes');
const genreRoutes = require('./routes/genreRoutes');
const scannerRoutes = require('./routes/scannerRoutes');
const ticketRoutes = require('./routes/ticketRoutes');

const { logger, loggerMiddleware } = require('./utils/logger');
const { serverError } = require('./utils/httpError');
const helmetMiddleware = require('./middleware/helmetMiddleware');

const app = express();
const port = process.env.PORT || 5000;

// Di belakang reverse proxy/PaaS (Render, Railway, Heroku, Nginx, dll) IP klien ada di X-Forwarded-For.
// Tanpa 'trust proxy', rate limiter melihat SEMUA user sebagai satu IP (IP proxy) -> satu orang nakal
// bisa memblokir semua orang. Atur TRUST_PROXY: angka (jumlah proxy), 'true'/'false', atau daftar IP/subnet.
// Default: 1 di production, nonaktif di development.
(() => {
  const raw = process.env.TRUST_PROXY;
  let value = process.env.NODE_ENV === 'production' ? 1 : false;
  if (raw !== undefined && raw !== '') {
    if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (/^\d+$/.test(raw)) value = Number(raw);
    else value = raw;
  }
  app.set('trust proxy', value);
})();

// Middleware Global: log -> header keamanan -> CORS (sebelum limiter agar respons 429 tetap membawa header CORS)
app.use(loggerMiddleware);
app.use(helmetMiddleware);
app.use(corsMiddleware());

// Global Rate Limiter. Webhook Midtrans dikecualikan: itu server-ke-server dari IP Midtrans yang sama,
// jika ikut dibatasi notifikasi pembayaran asli bisa ditolak (429) -> tiket tidak terbit.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/payments/notification') return next();
  return globalLimiter(req, res, next);
});

// Specific Rate Limiters (MUST be before route registration to take effect)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/seats/lock', seatLockLimiter);
app.use('/api/payments/:orderId/create', paymentCreateLimiter);
app.use('/api/seats/generate', seatGenerateLimiter);

// Batas ukuran body (default Express 100kb dibuat eksplisit); file diunggah lewat multer (batas sendiri).
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rute Dasar / Health Check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Backend REST API Tiket Konser UKK siap digunakan.',
    version: '1.0.0'
  });
});

// Registrasi Route API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/ticket-categories', ticketCategoryRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/venue-types', venueTypeRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/tickets', ticketRoutes);

// Handling Route 404 (Not Found)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' tidak ditemukan.`
  });
});

// Handling Global Error: tidak pernah membocorkan pesan internal ke klien.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // JSON rusak / body terlalu besar (dari body-parser)
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Format JSON tidak valid.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Ukuran request terlalu besar.' });
  }

  // Error upload (multer)
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Ukuran file maksimal 5 MB.' });
    }
    return res.status(400).json({ success: false, message: 'Upload file tidak valid.' });
  }

  // Error 4xx yang sengaja dibuat kode kita (mis. tipe file ditolak): pesannya memang untuk user.
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  return serverError(res, err, 'Unhandled error');
});

// Only start server when run directly (not when required for testing)
if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    logger.info('Server started on port %s', port);
    logger.info('Akses dari emulator: http://10.0.2.2:%s', port);
  });
}

module.exports = app;