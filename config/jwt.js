require('dotenv').config();

// SATU SUMBER KEBENARAN untuk JWT.
// PENTING: Set JWT_SECRET di file .env untuk produksi.
// Fallback di bawah hanya agar konsisten (mencegah token login tidak valid
// saat JWT_SECRET belum diset). Jangan pakai fallback ini di produksi.
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_tiket_konser_ukk_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

module.exports = { JWT_SECRET, JWT_EXPIRES_IN };
