const { z } = require('zod');
const { MAX_SEATS_PER_ORDER } = require('../config/limits.js');

const createOrderSchema = z.object({
  seat_ids: z
    .array(z.coerce.number().int().positive('seat_id harus angka positif'))
    .min(1, 'seat_ids minimal 1 item')
    .max(MAX_SEATS_PER_ORDER, `Maksimal ${MAX_SEATS_PER_ORDER} kursi per order`)
});

module.exports = {
  createOrderSchema
};
