const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const userModel = require('../models/userModel');

const VALID_ROLES = ['SuperAdmin', 'Admin', 'Customer', 'Scanner'];

const authController = {
  async register(req, res) {
    try {
      const { username, email, password, role } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username, email, dan password wajib diisi.'
        });
      }

      const assignedRole = role || 'Customer';
      if (!VALID_ROLES.includes(assignedRole)) {
        return res.status(400).json({
          success: false,
          message: `Role '${role}' tidak valid. Pilihan role: ${VALID_ROLES.join(', ')}`
        });
      }

      const existingUser = await userModel.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.'
        });
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const newUser = await userModel.createUser({
        username,
        email,
        password: hashedPassword,
        role: assignedRole
      });

      return res.status(201).json({
        success: true,
        message: 'Registrasi berhasil.',
        data: newUser
      });
    } catch (error) {
      console.error('Error on register:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat registrasi.',
        error: error.message
      });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email dan password wajib diisi.'
        });
      }

      const user = await userModel.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Email atau password salah.'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Email atau password salah.'
        });
      }

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role
      };

      const secretKey = JWT_SECRET;
      const expiresIn = JWT_EXPIRES_IN;

      const token = jwt.sign(payload, secretKey, { expiresIn });

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
      console.error('Error on login:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat login.',
        error: error.message
      });
    }
  },

  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await userModel.findUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User tidak ditemukan.'
        });
      }

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Error on getProfile:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat mengambil profil.',
        error: error.message
      });
    }
  }
};

module.exports = authController;
