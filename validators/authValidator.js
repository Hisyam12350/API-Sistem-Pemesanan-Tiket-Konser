const { z } = require('zod');

// CATATAN KEAMANAN: registrasi publik TIDAK menerima field `role`.
// Semua akun baru selalu 'Customer'. Role Scanner/Admin hanya boleh diberikan
// lewat PUT /api/users/:id oleh SuperAdmin (Admin: hanya Customer <-> Scanner).
// Field `role` yang dikirim klien otomatis dibuang oleh Zod.

// Email dinormalisasi (trim + huruf kecil) supaya "Budi@x.com" dan "budi@x.com" tidak jadi dua akun.
const emailField = z.string().trim().toLowerCase().email('Format email tidak valid').max(254, 'Email terlalu panjang');

// bcrypt hanya memakai 72 byte pertama password; batas atas 72 mencegah password panjang "terpotong diam-diam".
const newPassword = z.string().min(8, 'Password minimal 8 karakter').max(72, 'Password maksimal 72 karakter');

const registerSchema = z.object({
  username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter'),
  email: emailField,
  password: newPassword
});

// Login TIDAK memberlakukan min 8: akun lama dengan password 6 karakter tetap bisa masuk.
const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password wajib diisi').max(200, 'Password terlalu panjang')
});

const changePasswordSchema = z.object({
  old_password: z.string().min(1, 'Password lama wajib diisi').max(200),
  new_password: newPassword
}).refine((d) => d.old_password !== d.new_password, { message: 'Password baru harus berbeda dari password lama.', path: ['new_password'] });

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema
};
