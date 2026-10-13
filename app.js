require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const ticketCategoryRoutes = require('./routes/ticketCategoryRoutes');

const app = express();
const port = process.env.PORT || 5000;

// Middleware Global
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Handling Route 404 (Not Found)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' tidak ditemukan.`
  });
});

// Handling Global Error
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan pada server.',
    error: err.message
  });
});

app.listen(port, () => {
  console.log(`API Tiket Konser UKK berjalan di http://localhost:${port}`);
});