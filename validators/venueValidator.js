const { z } = require('zod');

const emptyStringToNull = (val) => val === '' ? null : val;

const createVenueSchema = z.object({
  venue_type_id: z.coerce.number().int().positive('venue_type_id harus angka positif'),
  nama_venue: z.string().min(1, 'Nama venue wajib diisi').max(255, 'Nama venue maksimal 255 karakter'),
  alamat: z.string().min(1, 'Alamat wajib diisi').max(1000, 'Alamat maksimal 1000 karakter'),
  kota: z.string().max(100, 'Kota maksimal 100 karakter').optional().nullable(),
  kapasitas: z.preprocess(emptyStringToNull, z.coerce.number().int().positive('Kapasitas harus angka positif').nullable()).optional(),
  gambar_url: z.string().url('Format URL gambar tidak valid').optional().nullable()
});

const updateVenueSchema = createVenueSchema.partial();

module.exports = {
  createVenueSchema,
  updateVenueSchema
};