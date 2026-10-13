const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');

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
      console.error('Error on getAllUsers:', error);
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
      console.error('Error on getUserById:', error);
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
      const { username, email, password, role } = req.body;

      const existingUser = await userModel.findUserById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: `User dengan ID ${id} tidak ditemukan.`
        });
      }

      if (role && !VALID_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Role '${role}' tidak valid. Pilihan role: ${VALID_ROLES.join(', ')}`
        });
      }

      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const updatedUser = await userModel.updateUser(id, {
        username,
        email,
        password: hashedPassword,
        role
      });

      return res.status(200).json({
        success: true,
        message: 'Data user berhasil diperbarui.',
        data: updatedUser
      });
    } catch (error) {
      console.error('Error on updateUser:', error);
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
      console.error('Error on deleteUser:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada server saat menghapus user.',
        error: error.message
      });
    }
  }
};

module.exports = userController;
