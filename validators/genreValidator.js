const { z } = require('zod');

const createGenreSchema = z.object({
  nama_genre: z.string().min(1, 'Nama genre wajib diisi').max(100, 'Nama genre maksimal 100 karakter'),
  deskripsi: z.string().max(500, 'Deskripsi maksimal 500 karakter').optional().nullable()
});

const updateGenreSchema = createGenreSchema.partial();

module.exports = {
  createGenreSchema,
  updateGenreSchema
};