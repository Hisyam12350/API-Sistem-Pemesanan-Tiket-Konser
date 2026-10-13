const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

const authMiddleware = {
  verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token tidak ditemukan atau format salah (Bearer token).'
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid atau telah kadaluwarsa.'
      });
    }
  },

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
