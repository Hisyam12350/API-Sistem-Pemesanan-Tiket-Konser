const { z } = require('zod');

const registerSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter').max(100, 'Password maksimal 100 karakter')
});

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi')
});

module.exports = {
  registerSchema,
  loginSchema
};