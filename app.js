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
const helmetMiddleware = require('./middleware/helmetMiddleware');

const app = express();
const port = process.env.PORT || 5000;

// Global Rate Limiter
app.use(globalLimiter);

// Specific Rate Limiters (MUST be before route registration to take effect)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/seats/lock', seatLockLimiter);
app.use('/api/payments/:orderId/create', paymentCreateLimiter);
app.use('/api/seats/generate', seatGenerateLimiter);

// Middleware Global
app.use(loggerMiddleware);
app.use(corsMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Security headers
app.use(helmetMiddleware);

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

// Handling Global Error
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message, err.stack);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan pada server.',
    error: err.message
  });
});

// Only start server when run directly (not when required for testing)
if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    logger.info('Server started on port %s', port);
    logger.info('Akses dari emulator: http://10.0.2.2:%s', port);
  });
}

module.exports = app;