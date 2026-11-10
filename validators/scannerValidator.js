const { z } = require('zod');

const checkInSchema = z.object({
  kode_unik: z.string().min(1, 'kode_unik wajib diisi').max(100, 'kode_unik maksimal 100 karakter')
});

module.exports = {
  checkInSchema
};