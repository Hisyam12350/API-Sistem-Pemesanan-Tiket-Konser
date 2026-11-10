const { z } = require('zod');

const emptyStringToNull = (val) => val === '' ? null : val;

const generateSeatsSchema = z.object({
  kategori_id: z.coerce.number().int().positive('kategori_id harus angka positif'),
  jumlah: z.coerce.number().int().positive('Jumlah harus bilangan bulat positif').max(500, 'Maksimal 500 kursi per request'),
  prefix: z.string().max(10, 'Prefix maksimal 10 karakter').optional().nullable(),
  start_number: z.preprocess(emptyStringToNull, z.coerce.number().int().min(1, 'start_number minimal 1').nullable()).optional()
});

const lockSeatsSchema = z.object({
  seat_ids: z.array(z.coerce.number().int().positive('seat_id harus angka positif')).min(1, 'seat_ids minimal 1 item'),
  minutes: z.preprocess(emptyStringToNull, z.coerce.number().int().positive('Minutes harus bilangan bulat positif').max(60, 'Maksimal 60 menit').nullable()).optional()
});

const unlockSeatsSchema = z.object({
  seat_ids: z.array(z.coerce.number().int().positive('seat_id harus angka positif')).min(1, 'seat_ids minimal 1 item')
});

module.exports = {
  generateSeatsSchema,
  lockSeatsSchema,
  unlockSeatsSchema
};