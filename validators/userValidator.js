const { z } = require('zod');

const updateUserSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter').optional(),
  email: z.string().email('Format email tidak valid').optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').max(100, 'Password maksimal 100 karakter').optional(),
  role: z.enum(['SuperAdmin', 'Admin', 'Customer', 'Scanner']).optional()
});

module.exports = { updateUserSchema };