const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { logger } = require('../utils/logger');

const VALID_ROLES = ['SuperAdmin', 'Admin', 'Customer', 'Scanner'];

const userController = {
  async getAllUsers(req, res) {
    try {
      const users = await userModel.getAllUsers();
      return res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error on getAllUsers');
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat mengambil daftar user.',
        error: error.message
      });
    }
  },

  async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await userModel.findUserById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: `User dengan ID ${id} tidak ditemukan.`
        });
      }

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error on getUserById');
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat mengambil data user.',
        error: error.message
      });
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email, password, role } = req.validated;

      const existingUser = await userModel.findUserById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: `User dengan ID ${id} tidak ditemukan.`
        });
      }

      // Defense in depth: Check ownership (Customer can only update themselves)
      if (req.user.role !== 'SuperAdmin' && req.user.id !== id) {
        return res.status(403).json({
          success: false,
          message: 'Akses dilarang. Anda hanya dapat mengubah data sendiri.'
        });
      }

      // Only SuperAdmin can modify role
      const updateData = { username, email, password: null };
      if (req.user.role === 'SuperAdmin' && role) {
        if (!VALID_ROLES.includes(role)) {
          return res.status(400).json({
            success: false,
            message: `Role '${role}' tidak valid. Pilihan role: ${VALID_ROLES.join(', ')}`
          });
        }
        updateData.role = role;
      }

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      // Remove undefined fields
      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

      const updatedUser = await userModel.updateUser(id, updateData);

      return res.status(200).json({
        success: true,
        message: 'Data user berhasil diperbarui.',
        data: updatedUser
      });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error on updateUser');
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat memperbarui data user.',
        error: error.message
      });
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const deletedUser = await userModel.deleteUser(id);

      if (!deletedUser) {
        return res.status(404).json({
          success: false,
          message: `User dengan ID ${id} tidak ditemukan.`
        });
      }

      return res.status(200).json({
        success: true,
        message: `User '${deletedUser.username}' (ID: ${id}) berhasil dihapus.`,
        data: deletedUser
      });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error on deleteUser');
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat menghapus user.',
        error: error.message
      });
    }
  }
};

module.exports = userController;
