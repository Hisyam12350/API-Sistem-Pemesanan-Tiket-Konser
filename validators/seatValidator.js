const { z } = require('zod');
const { MAX_SEATS_PER_ORDER, MAX_LOCK_MINUTES } = require('../config/limits.js');

const emptyStringToNull = (val) => val === '' ? null : val;

const generateSeatsSchema = z.object({
  kategori_id: z.coerce.number().int().positive('kategori_id harus angka positif'),
  jumlah: z.coerce.number().int().positive('Jumlah harus bilangan bulat positif').max(500, 'Maksimal 500 kursi per request'),
  prefix: z.string().max(10, 'Prefix maksimal 10 karakter').optional().nullable(),
  start_number: z.preprocess(emptyStringToNull, z.coerce.number().int().min(1, 'start_number minimal 1').nullable()).optional()
});

const lockSeatsSchema = z.object({
  seat_ids: z.array(z.coerce.number().int().positive('seat_id harus angka positif')).min(1, 'seat_ids minimal 1 item').max(MAX_SEATS_PER_ORDER, `Maksimal ${MAX_SEATS_PER_ORDER} kursi per permintaan`),
  minutes: z.preprocess(emptyStringToNull, z.coerce.number().int().positive('Minutes harus bilangan bulat positif').max(MAX_LOCK_MINUTES, `Maksimal ${MAX_LOCK_MINUTES} menit`).nullable()).optional()
});

const unlockSeatsSchema = z.object({
  seat_ids: z.array(z.coerce.number().int().positive('seat_id harus angka positif')).min(1, 'seat_ids minimal 1 item').max(MAX_SEATS_PER_ORDER, `Maksimal ${MAX_SEATS_PER_ORDER} kursi per permintaan`)
});

module.exports = {
  generateSeatsSchema,
  lockSeatsSchema,
  unlockSeatsSchema
};