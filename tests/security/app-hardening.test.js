// Test: header keamanan, error handler global, rate limiter webhook, upload (tipe & isi file), trust proxy.
require('./_env');
process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/db';
process.env.NODE_ENV = 'test';

jest.mock('../../config/db', () => ({ query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() }));
jest.mock('../../models/userModel');
jest.mock('../../config/supabase', () => {
  const upload = jest.fn().mockResolvedValue({ error: null });
  return { storage: { from: jest.fn(() => ({ upload, getPublicUrl: () => ({ data: { publicUrl: 'http://x/events/banners/a.png' } }), remove: jest.fn() })) }, __upload: upload };
});
jest.mock('../../models/events.js', () => ({
  getEventById: jest.fn(), createEvents: jest.fn(async (e) => ({ id: 1, ...e })), getEventWithVenue: jest.fn()
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const userModel = require('../../models/userModel');
const supabase = require('../../config/supabase');
const { JWT_SECRET } = require('../../config/jwt');
const storageService = require('../../utils/storageService');
const app = require('../../app');

const adminToken = () => jwt.sign({ id: 1 }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
beforeEach(() => {
  userModel.findUserById.mockResolvedValue({ id: 1, email: 'a@x.com', role: 'Admin' });
  supabase.__upload.mockClear();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('header keamanan (helmet)', () => {
  test('header penting ada & Referrer-Policy bukan unsafe-url', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});

describe('error handler global', () => {
  test('JSON rusak -> 400 (bukan 500)', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JSON/);
  });
  test('body terlalu besar -> 413', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
  test('route tidak ada -> 404 JSON', async () => {
    const res = await request(app).get('/api/tidak-ada');
    expect(res.status).toBe(404);
  });
});

describe('upload gambar', () => {
  const post = (buf, name, type) => request(app).post('/api/events').set('Authorization', `Bearer ${adminToken()}`)
    .field('nama_event', 'Konser').field('waktu_event', '2030-01-01T10:00:00Z').field('lokasi', 'GBK')
    .attach('banner', buf, { filename: name, contentType: type });

  test('SVG ditolak (400) dan tidak pernah sampai ke storage', async () => {
    const res = await post(SVG, 'x.svg', 'image/svg+xml');
    expect(res.status).toBe(400);
    expect(supabase.__upload).not.toHaveBeenCalled();
  });
  // Catatan: uploadLimiter = 5 upload / 10 menit / IP (juga menghitung upload yang ditolak), jadi jumlah
  // request upload di blok ini sengaja dijaga <= 5.
  test('file bukan gambar yang menyamar (mimetype image/png tetapi isi HTML/SVG) -> 400, tidak diunggah', async () => {
    const res = await post(SVG, 'x.png', 'image/png');
    expect(res.status).toBe(400);
    expect(supabase.__upload).not.toHaveBeenCalled();
  });
  test('file > 5MB -> 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    expect((await post(big, 'big.png', 'image/png')).status).toBe(413);
  });
  test('PNG asli diterima; ekstensi & contentType ditentukan dari isi file, nama acak', async () => {
    const res = await post(PNG, '../../evil.php.png', 'image/png');
    expect(res.status).toBe(201);
    const [path, , opts] = supabase.__upload.mock.calls[0];
    expect(path).toMatch(/^banners\/\d+_[0-9a-f]{16}\.png$/);
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: false });
  });
  test('detectImageType: jpeg/png/webp dikenali, selainnya null', () => {
    expect(storageService.detectImageType(PNG).ext).toBe('png');
    expect(storageService.detectImageType(JPG).ext).toBe('jpg');
    expect(storageService.detectImageType(WEBP).ext).toBe('webp');
    expect(storageService.detectImageType(SVG)).toBeNull();
    expect(storageService.detectImageType(Buffer.alloc(0))).toBeNull();
    expect(storageService.detectImageType('bukan buffer')).toBeNull();
  });
  test('upload ke Supabase gagal -> 502 generik tanpa detail internal', async () => {
    supabase.__upload.mockResolvedValueOnce({ error: { message: 'Bucket not found: secret-bucket-name' } });
    const res = await post(PNG, 'a.png', 'image/png');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/secret-bucket-name/);
  });
});

describe('rate limiter & webhook', () => {
  test('webhook Midtrans tidak terkena global limiter (100 request/15 menit)', async () => {
    let last;
    for (let i = 0; i < 130; i++) last = await request(app).post('/api/payments/notification').send({});
    expect(last.status).toBe(400); // payload kosong ditolak validasi, BUKAN 429
  });
  test('endpoint biasa tetap dibatasi (429 setelah melewati batas global)', async () => {
    let status;
    for (let i = 0; i < 110; i++) status = (await request(app).get('/')).status;
    expect(status).toBe(429);
  });
});
