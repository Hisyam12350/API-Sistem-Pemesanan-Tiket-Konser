const { z } = require('zod');

const createTicketCategorySchema = z.object({
  event_id: z.coerce.number().int().positive('event_id harus angka positif'),
  nama_kategori: z.string().min(1, 'Nama kategori wajib diisi').max(100, 'Nama kategori maksimal 100 karakter'),
  harga: z.coerce.number().min(0, 'Harga tidak boleh negatif'),
  kuota_total: z.coerce.number().int().positive('Kuota total harus bilangan bulat positif')
});

const updateTicketCategorySchema = z.object({
  nama_kategori: z.string().min(1, 'Nama kategori wajib diisi').max(100, 'Nama kategori maksimal 100 karakter').optional(),
  harga: z.coerce.number().min(0, 'Harga tidak boleh negatif').optional(),
  kuota_total: z.coerce.number().int().positive('Kuota total harus bilangan bulat positif').optional()
});

module.exports = {
  createTicketCategorySchema,
  updateTicketCategorySchema
};