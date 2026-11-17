const { z } = require('zod');

// event_id WAJIB: scanner di pintu event A tidak boleh bisa meng-check-in tiket event B.
const checkInSchema = z.object({
  kode_unik: z.string().trim().min(1, 'kode_unik wajib diisi').max(100, 'kode_unik maksimal 100 karakter'),
  event_id: z.coerce.number({ invalid_type_error: 'event_id harus angka' }).int().positive('event_id wajib diisi dengan angka positif')
});

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page minimal 1').max(100000).default(1),
  limit: z.coerce.number().int().min(1, 'limit minimal 1').max(100, 'limit maksimal 100').default(20)
});

const eventParamSchema = z.object({
  eventId: z.coerce.number().int().positive('eventId harus angka positif')
});

const assignmentParamsSchema = z.object({
  eventId: z.coerce.number().int().positive('eventId harus angka positif'),
  scannerId: z.coerce.number().int().positive('scannerId harus angka positif')
});

const assignScannerSchema = z.object({
  scanner_id: z.coerce.number().int().positive('scanner_id harus angka positif')
});

module.exports = {
  checkInSchema,
  pageQuerySchema,
  eventParamSchema,
  assignmentParamsSchema,
  assignScannerSchema
};
