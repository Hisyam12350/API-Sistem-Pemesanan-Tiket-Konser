// Test: check-in atomik (eksploit #4b). pg Pool di-mock.
require('./_env');

jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('../../models/scannerAssignments', () => ({
  isAssigned: jest.fn(),
  listAssignedEvents: jest.fn(),
  listScannersForEvent: jest.fn()
}));
const pool = require('../../config/db');
const ScannerAssignment = require('../../models/scannerAssignments');

const express = require('express');
const request = require('supertest');
const scannerController = require('../../controllers/scannerController');

const app = express();
app.use(express.json());
app.post('/check-in', (req, res, next) => { req.user = { id: 7, role: 'Scanner' }; req.validated = req.body; next(); }, scannerController.checkIn);
app.post('/admin-check-in', (req, res, next) => { req.user = { id: 1, role: 'Admin' }; req.validated = req.body; next(); }, scannerController.checkIn);
app.get('/events/:eventId/scanned', (req, res, next) => {
  req.user = { id: 7, role: 'Scanner' };
  req.validated = { eventId: Number(req.params.eventId), page: 1, limit: 20 };
  next();
}, scannerController.getEventScannedTickets);
app.get('/assigned-events', (req, res, next) => {
  req.user = { id: 7, role: 'Scanner' };
  next();
}, scannerController.getAssignedEvents);
app.get('/admin/events/:eventId/assignments', (req, res, next) => {
  req.user = { id: 1, role: 'Admin' };
  req.validated = { eventId: Number(req.params.eventId) };
  next();
}, scannerController.getEventAssignments);

const ticketRow = (over = {}) => ({
  ticket_id: 1, kode_unik: 'TKT-1-1-ABC', status_tiket: 'active', scanned_at: null, scanned_by: null,
  seat_id: 1, nomor_kursi: 'A1', kategori_id: 1, category_id: 1, nama_kategori: 'VIP',
  event_id: 1, nama_event: 'Konser', waktu_event: new Date(Date.now() + 3600e3).toISOString(), event_status: 'upcoming', order_id: 5, status_order: 'paid',
  venue_id: null, ...over
});

beforeEach(() => {
  pool.query.mockReset();
  ScannerAssignment.isAssigned.mockReset().mockResolvedValue(true);
  ScannerAssignment.listAssignedEvents.mockReset().mockResolvedValue([]);
  ScannerAssignment.listScannersForEvent.mockReset().mockResolvedValue({ event_id: 1, scanners: [] });
});

test('Scanner hanya menerima daftar event dari assignment miliknya', async () => {
  ScannerAssignment.listAssignedEvents.mockResolvedValue([{ id: 4, nama_event: 'Event assigned' }]);
  const res = await request(app).get('/assigned-events');
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual([{ id: 4, nama_event: 'Event assigned' }]);
  expect(ScannerAssignment.listAssignedEvents).toHaveBeenCalledWith(7);
});

test('Admin dapat melihat Scanner yang ditugaskan pada event', async () => {
  const assignments = { event_id: 1, scanners: [{ scanner_id: 7, username: 'petugas', email: 'scanner@example.test' }] };
  ScannerAssignment.listScannersForEvent.mockResolvedValue(assignments);
  const res = await request(app).get('/admin/events/1/assignments');
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual(assignments);
  expect(ScannerAssignment.listScannersForEvent).toHaveBeenCalledWith(1);
});

test('event yang tidak ada memberi 404 saat Admin melihat assignment', async () => {
  ScannerAssignment.listScannersForEvent.mockResolvedValue(null);
  const res = await request(app).get('/admin/events/999/assignments');
  expect(res.status).toBe(404);
});

test('Scanner tanpa assignment tidak dapat check-in event', async () => {
  ScannerAssignment.isAssigned.mockResolvedValue(false);
  const res = await request(app).post('/check-in').send({ kode_unik: 'TKT-1-1-ABC', event_id: 1 });
  expect(res.status).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
});

test('Admin dapat check-in tanpa assignment event', async () => {
  pool.query
    .mockResolvedValueOnce({ rows: [ticketRow()] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, kode_unik: 'TKT-1-1-ABC', status_tiket: 'scanned', scanned_at: new Date().toISOString(), scanned_by: 1 }] });
  const res = await request(app).post('/admin-check-in').send({ kode_unik: 'TKT-1-1-ABC', event_id: 1 });
  expect(res.status).toBe(200);
  expect(ScannerAssignment.isAssigned).not.toHaveBeenCalled();
});

test('Scanner tanpa assignment tidak dapat melihat rekap event', async () => {
  ScannerAssignment.isAssigned.mockResolvedValue(false);
  const res = await request(app).get('/events/1/scanned');
  expect(res.status).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
});

test('check-in sukses memakai UPDATE bersyarat status_tiket=\'active\'', async () => {
  pool.query
    .mockResolvedValueOnce({ rows: [ticketRow()] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, kode_unik: 'TKT-1-1-ABC', status_tiket: 'scanned', scanned_at: new Date().toISOString(), scanned_by: 7 }] });
  const res = await request(app).post('/check-in').send({ kode_unik: 'TKT-1-1-ABC', event_id: 1 });
  expect(res.status).toBe(200);
  const updateSql = pool.query.mock.calls[1][0];
  expect(updateSql).toMatch(/WHERE id = \$1 AND status_tiket = 'active'/);
});

test('dua scanner bersamaan: yang kalah (0 baris) mendapat 409, BUKAN sukses ganda', async () => {
  // Kedua scanner sama-sama membaca status 'active' (SELECT), tapi UPDATE kedua tidak mengubah baris apa pun.
  pool.query
    .mockResolvedValueOnce({ rows: [ticketRow()] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] })
    .mockResolvedValueOnce({ rows: [{ status_tiket: 'scanned', scanned_at: '2026-11-12T10:00:00Z' }] });
  const res = await request(app).post('/check-in').send({ kode_unik: 'TKT-1-1-ABC', event_id: 1 });
  expect(res.status).toBe(409);
  expect(res.body.message).toBe('Tiket sudah dipindai.');
  expect(res.body.scanned_at).toBe('2026-11-12T10:00:00Z');
});


const HOUR = 3600e3;
const scan = (body = { kode_unik: 'TKT-1-1-ABC', event_id: 1 }) => request(app).post('/check-in').send(body);

describe('Scanner: aturan check-in', () => {
  test('tiket event lain ditolak (scanner dikunci ke event yang dijaga)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [ticketRow({ event_id: 2 })] });
    const res = await scan();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/bukan untuk event/);
    expect(pool.query).toHaveBeenCalledTimes(1); // tidak sampai UPDATE
  });

  test.each(['pending', 'expired', 'cancelled'])('order berstatus %s -> ditolak', async (status_order) => {
    pool.query.mockResolvedValueOnce({ rows: [ticketRow({ status_order })] });
    const res = await scan();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/lunas/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('UPDATE check-in juga memastikan order masih paid (tahan terhadap refund yang berbarengan)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [ticketRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, kode_unik: 'x', status_tiket: 'scanned', scanned_at: 'now', scanned_by: 7 }] });
    await scan();
    expect(pool.query.mock.calls[1][0]).toMatch(/status_order = 'paid'/);
  });

  test('check-in sebelum jendela dibuka -> 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [ticketRow({ waktu_event: new Date(Date.now() + 48 * HOUR).toISOString() })] });
    const res = await scan();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/belum dibuka/);
  });

  test('check-in lama setelah acara (status event belum diubah) -> 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [ticketRow({ waktu_event: new Date(Date.now() - 48 * HOUR).toISOString() })] });
    const res = await scan();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ditutup/);
  });

  test('event completed -> 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [ticketRow({ event_status: 'completed' })] });
    expect((await scan()).status).toBe(409);
  });

  test('event_id tidak dikirim -> ditolak validator (400)', async () => {
    const { checkInSchema } = require('../../validators/scannerValidator');
    expect(checkInSchema.safeParse({ kode_unik: 'abc' }).success).toBe(false);
    expect(checkInSchema.safeParse({ kode_unik: 'abc', event_id: 'abc' }).success).toBe(false);
    expect(checkInSchema.safeParse({ kode_unik: 'abc', event_id: '3' }).data.event_id).toBe(3);
  });

  test('error DB tidak membocorkan pesan internal', async () => {
    pool.query.mockRejectedValueOnce(new Error('relation "tickets" does not exist'));
    const res = await scan();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|tickets/);
  });
});

describe('Scanner: parameter daftar tiket', () => {
  const { pageQuerySchema, eventParamSchema } = require('../../validators/scannerValidator');
  test('page/limit diberi batas & default; nilai ngawur ditolak', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(pageQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
    expect(eventParamSchema.safeParse({ eventId: "1; DROP TABLE tickets" }).success).toBe(false);
  });
});
