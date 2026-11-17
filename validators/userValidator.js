const { z } = require('zod');

// Validasi untuk PUT /api/users/:id
// - Semua field opsional, tetapi minimal satu harus dikirim.
// - Field di luar daftar ini otomatis dibuang oleh Zod (tidak bisa "menyelundupkan" kolom lain).
// - Aturan SIAPA yang boleh mengubah role/akun siapa ada di userController (butuh konteks req.user).
const updateUserSchema = z
  .object({
    username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter').optional(),
    email: z.string().trim().toLowerCase().email('Format email tidak valid').max(254).optional(),
    password: z.string().min(8, 'Password minimal 8 karakter').max(72, 'Password maksimal 72 karakter').optional(),
    role: z.enum(['SuperAdmin', 'Admin', 'Customer', 'Scanner']).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field (username, email, password, role) harus dikirim.'
  });

module.exports = { updateUserSchema };
