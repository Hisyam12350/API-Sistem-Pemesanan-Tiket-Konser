const { z } = require('zod');

const emptyStringToNull = (val) => val === '' ? null : val;

const createEventSchema = z.object({
  nama_event: z.string().min(1, 'Nama event wajib diisi').max(255, 'Nama event maksimal 255 karakter'),
  waktu_event: z.string().datetime({ offset: true }, 'Format waktu_event tidak valid (ISO 8601)'),
  venue_id: z.preprocess(emptyStringToNull, z.coerce.number().int().positive('venue_id harus angka positif').nullable()).optional(),
  genre_id: z.preprocess(emptyStringToNull, z.coerce.number().int().positive('genre_id harus angka positif').nullable()).optional(),
  deskripsi: z.string().max(2000, 'Deskripsi maksimal 2000 karakter').optional().nullable(),
  detail_lokasi: z.string().max(1000, 'Detail lokasi maksimal 1000 karakter').optional().nullable(),
  lokasi: z.string().max(500, 'Lokasi maksimal 500 karakter').optional().nullable(),
  status: z.enum(['upcoming', 'ongoing', 'completed']).optional(),
  banner_url: z.string().url('Format URL banner tidak valid').optional().nullable()
});

const updateEventSchema = createEventSchema.partial();

module.exports = {
  createEventSchema,
  updateEventSchema
};