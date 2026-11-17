const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const userModel = require('../models/userModel');
const { logger } = require('../utils/logger');

// Cache singkat hasil pengecekan user di DB (id -> { role, email, exp }).
// Tujuan: token milik user yang SUDAH DIHAPUS atau yang role-nya SUDAH DIUBAH berhenti berlaku dalam hitungan
// detik, bukan sampai token kedaluwarsa (default 1 hari). TTL pendek menjaga beban DB tetap kecil.
const USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 15000);
const userCache = new Map();

function invalidateUser(id) {
  userCache.delete(Number(id));
}

async function lookupUser(id) {
  const key = Number(id);
  const hit = userCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.user;

  const user = await userModel.findUserById(key);
  if (user) {
    userCache.set(key, { user: { id: user.id, email: user.email, role: user.role }, exp: Date.now() + USER_CACHE_TTL_MS });
    if (userCache.size > 5000) userCache.clear(); // batas memori sederhana
  } else {
    userCache.delete(key);
  }
  return user ? { id: user.id, email: user.email, role: user.role } : null;
}

const authMiddleware = {
  async verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    // Skema "Bearer" + SPASI (sebelumnya "BearerXYZ" juga lolos).
    const match = typeof authHeader === 'string' ? /^Bearer +(\S+)$/i.exec(authHeader) : null;
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token tidak ditemukan atau format salah (Bearer token).'
      });
    }

    let decoded;
    try {
      // Algoritma dikunci ke HS256 (mencegah token dengan algoritma lain/"none" diterima).
      decoded = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid atau telah kadaluwarsa.'
      });
    }

    try {
      // Role diambil dari DB (bukan dari isi token): user yang dihapus/di-demote langsung kehilangan akses.
      const user = await lookupUser(decoded.id);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Akun tidak ditemukan atau sudah dihapus.' });
      }
      req.user = { id: user.id, email: user.email, role: user.role };
      return next();
    } catch (error) {
      // Gagal memverifikasi user = tolak (fail closed), jangan diloloskan dengan role dari token.
      logger.error({ err: error.message }, 'verifyToken: gagal memeriksa user di database');
      return res.status(503).json({ success: false, message: 'Layanan sementara tidak tersedia. Coba lagi sebentar.' });
    }
  },

  invalidateUser,

  authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Akses dilarang. Membutuhkan hak akses: ${allowedRoles.join(', ')}.`
        });
      }
      next();
    };
  }
};

module.exports = authMiddleware;
