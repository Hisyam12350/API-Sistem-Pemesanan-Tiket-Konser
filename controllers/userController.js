const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { mapError } = require('../utils/httpError');
const { invalidateUser } = require('../middleware/authMiddleware');

// Role yang boleh dikelola oleh Admin (bukan SuperAdmin). Admin tidak boleh menyentuh
// akun Admin/SuperAdmin, dan tidak boleh menaikkan siapa pun menjadi Admin/SuperAdmin.
const ADMIN_MANAGEABLE_ROLES = ['Customer', 'Scanner'];

function forbidden(res, message) {
  return res.status(403).json({ success: false, message });
}

const userController = {
  async getAllUsers(req, res) {
    try {
      const users = await userModel.getAllUsers();
      return res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      return mapError(error, res, 'Error on getAllUsers');
    }
  },

  async getUserById(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
      }
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
      return mapError(error, res, 'Error on getUserById');
    }
  },

  /**
   * PUT /api/users/:id
   *
   * Aturan otorisasi:
   *  - Customer : hanya boleh mengubah AKUN SENDIRI, dan tidak boleh mengubah role.
   *  - Admin    : boleh mengubah akun sendiri (tanpa mengubah role) dan akun Customer/Scanner.
   *               Boleh memindahkan role hanya di antara Customer <-> Scanner.
   *               Tidak boleh menyentuh akun Admin/SuperAdmin lain.
   *  - SuperAdmin: boleh mengubah semua akun dan role, kecuali mengubah role dirinya sendiri
   *               (mencegah SuperAdmin terkunci keluar secara tidak sengaja).
   */
  async updateUser(req, res) {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
      }

      const actor = req.user;
      const isSelf = Number(actor.id) === targetId;
      const { username, email, password, role } = req.validated;

      // Cek paling murah dulu: non-admin tidak boleh menyentuh akun orang lain.
      // Dilakukan SEBELUM query DB agar tidak membocorkan apakah ID tersebut ada.
      if (actor.role !== 'SuperAdmin' && actor.role !== 'Admin' && !isSelf) {
        return forbidden(res, 'Anda hanya boleh mengubah akun Anda sendiri.');
      }

      const existingUser = await userModel.findUserById(targetId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: `User dengan ID ${targetId} tidak ditemukan.`
        });
      }

      const wantsRoleChange = role !== undefined && role !== existingUser.role;

      if (actor.role === 'SuperAdmin') {
        if (isSelf && wantsRoleChange) {
          return forbidden(res, 'SuperAdmin tidak dapat mengubah role akunnya sendiri.');
        }
      } else if (actor.role === 'Admin') {
        if (isSelf) {
          if (wantsRoleChange) {
            return forbidden(res, 'Anda tidak dapat mengubah role akun Anda sendiri.');
          }
        } else {
          if (!ADMIN_MANAGEABLE_ROLES.includes(existingUser.role)) {
            return forbidden(res, 'Admin tidak boleh mengubah akun Admin/SuperAdmin.');
          }
          if (wantsRoleChange && !ADMIN_MANAGEABLE_ROLES.includes(role)) {
            return forbidden(res, 'Admin hanya boleh mengatur role Customer atau Scanner.');
          }
        }
      } else {
        // Customer (atau role lain) yang mengubah akun sendiri: role tidak boleh berubah.
        if (wantsRoleChange) {
          return forbidden(res, 'Anda tidak diizinkan mengubah role.');
        }
      }

      // Tidak ada perubahan nyata (mis. hanya mengirim role yang sama): jangan kirim UPDATE kosong.
      if (username === undefined && email === undefined && !password && !wantsRoleChange) {
        return res.status(200).json({
          success: true,
          message: 'Tidak ada perubahan.',
          data: existingUser
        });
      }

      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 12);
      }

      const updatedUser = await userModel.updateUser(targetId, {
        username,
        email,
        password: hashedPassword,
        role: wantsRoleChange ? role : undefined
      });

      // Role/akun berubah -> buang cache auth supaya efeknya langsung berlaku.
      invalidateUser(targetId);

      return res.status(200).json({
        success: true,
        message: 'Data user berhasil diperbarui.',
        data: updatedUser
      });
    } catch (error) {
      if (error && error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Email sudah dipakai akun lain.'
        });
      }
      return mapError(error, res, 'Error on updateUser');
    }
  },

  async deleteUser(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
      }
      // Mencegah SuperAdmin menghapus akunnya sendiri (sistem bisa tanpa SuperAdmin).
      if (Number(req.user.id) === id) {
        return res.status(403).json({ success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri.' });
      }
      const deletedUser = await userModel.deleteUser(id);
      invalidateUser(id);

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
      return mapError(error, res, 'Error on deleteUser');
    }
  }
};

module.exports = userController;
