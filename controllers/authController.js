const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const userModel = require('../models/userModel');
const { invalidateUser } = require('../middleware/authMiddleware');
const { mapError } = require('../utils/httpError');

// Biaya bcrypt 12 (2^12 putaran): lebih mahal bagi penyerang yang membobol hash; ~250ms per hash, wajar untuk login.
const BCRYPT_ROUNDS = 12;

// Hash "umpan" untuk login dengan email yang tidak terdaftar: bcrypt.compare tetap dijalankan sehingga waktu
// respons email-tidak-ada sama dengan email-ada-password-salah (mencegah enumerasi email lewat selisih waktu).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-untuk-timing', BCRYPT_ROUNDS);

function signToken(user) {
  // Payload minimal; role TIDAK dipercaya dari token (diambil dari DB di verifyToken).
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

const authController = {
  async register(req, res) {
    try {
      // Pakai data hasil validasi Zod (req.validated), bukan req.body mentah.
      // `role` sengaja TIDAK dibaca dari klien: registrasi publik selalu menghasilkan 'Customer'.
      // Role Scanner/Admin hanya bisa diberikan lewat PUT /api/users/:id oleh SuperAdmin/Admin.
      const { username, email, password } = req.validated;

      const existingUser = await userModel.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.'
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const newUser = await userModel.createUser({
        username,
        email,
        password: hashedPassword,
        role: 'Customer'
      });

      const token = signToken(newUser);

      return res.status(201).json({
        success: true,
        message: 'Registrasi berhasil.',
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        },
        data: newUser
      });
    } catch (error) {
      // Dua registrasi bersamaan dengan email yang sama: unique constraint DB yang menang.
      if (error && error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.'
        });
      }
      return mapError(error, res, 'Error on register');
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.validated;

      const user = await userModel.findUserByEmail(email);
      const isPasswordValid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

      if (!user || !isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Email atau password salah.'
        });
      }

      const token = signToken(user);

      return res.status(200).json({
        success: true,
        message: 'Login berhasil.',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      return mapError(error, res, 'Error on login');
    }
  },

  async getProfile(req, res) {
    try {
      const user = await userModel.findUserById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      }

      return res.status(200).json({ success: true, data: user });
    } catch (error) {
      return mapError(error, res, 'Error on getProfile');
    }
  },

  // PUT /api/auth/change-password — user mengganti password sendiri (wajib menyertakan password lama).
  async changePassword(req, res) {
    try {
      const { old_password, new_password } = req.validated;

      const record = await userModel.getPasswordHashById(req.user.id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      }

      const ok = await bcrypt.compare(old_password, record.password);
      if (!ok) {
        return res.status(401).json({ success: false, message: 'Password lama salah.' });
      }

      const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
      await userModel.updateUser(req.user.id, { password: hashed });
      invalidateUser(req.user.id);

      return res.status(200).json({ success: true, message: 'Password berhasil diubah.' });
    } catch (error) {
      return mapError(error, res, 'Error on changePassword');
    }
  }
};

module.exports = authController;
