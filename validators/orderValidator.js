const { z } = require('zod');

const createOrderSchema = z.object({
  seat_ids: z.array(z.coerce.number().int().positive('seat_id harus angka positif')).min(1, 'seat_ids minimal 1 item')
});

module.exports = {
  createOrderSchema
};