// Test: verifyToken (algoritma dikunci, skema Bearer, role dari DB, fail-closed) + login/ganti password.
require('./_env');
jest.mock('../../models/userModel');
const userModel = require('../../models/userModel');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const express = require('express');
const request = require('supertest');
const { JWT_SECRET } = require('../../config/jwt');
const { verifyToken, authorizeRoles, invalidateUser } = require('../../middleware/authMiddleware');
const { validate } = require('../../middleware/validationMiddleware');
const authController = require('../../controllers/authController');
const { loginSchema, registerSchema, changePasswordSchema } = require('../../validators/authValidator');

const app = express();
app.use(express.json());
app.get('/who', verifyToken, (req, res) => res.json(req.user));
app.get('/admin', verifyToken, authorizeRoles('Admin', 'SuperAdmin'), (req, res) => res.json({ ok: true }));
app.post('/login', validate(loginSchema), authController.login);
app.post('/register', validate(registerSchema), authController.register);
app.put('/pw', verifyToken, validate(changePasswordSchema), authController.changePassword);

const tok = (payload, opts = {}) => jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h', ...opts });
const DB = {};
beforeEach(() => {
  jest.resetAllMocks();
  for (const k of Object.keys(DB)) delete DB[k];
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(invalidateUser);
  userModel.findUserById.mockImplementation(async (id) => DB[Number(id)] || null);
});

describe('verifyToken', () => {
  test('token dengan alg "none" ditolak', async () => {
    DB[1] = { id: 1, email: 'a@x.com', role: 'SuperAdmin' };
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 1, role: 'SuperAdmin' })}.`;
    expect((await request(app).get('/who').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  test('token HS512 (algoritma lain) ditolak walau secret benar', async () => {
    DB[1] = { id: 1, email: 'a@x.com', role: 'Customer' };
    const t = jwt.sign({ id: 1 }, JWT_SECRET, { algorithm: 'HS512' });
    expect((await request(app).get('/who').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });

  test.each(['BearerXYZ', 'Basic abc', 'Bearer', 'bearer'])('header "%s" ditolak', async (h) => {
    expect((await request(app).get('/who').set('Authorization', h)).status).toBe(401);
  });

  test('token valid + user ada -> 200', async () => {
    DB[1] = { id: 1, email: 'a@x.com', role: 'Customer' };
    const res = await request(app).get('/who').set('Authorization', `Bearer ${tok({ id: 1, role: 'Customer' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, email: 'a@x.com', role: 'Customer' });
  });

  test('role diambil dari DB, bukan dari token: token lama "Admin" milik user yang sudah di-demote -> 403', async () => {
    DB[2] = { id: 2, email: 'b@x.com', role: 'Customer' }; // sudah di-demote
    const stale = tok({ id: 2, role: 'Admin' });
    expect((await request(app).get('/admin').set('Authorization', `Bearer ${stale}`)).status).toBe(403);
  });

  test('token milik user yang sudah dihapus -> 401', async () => {
    const res = await request(app).get('/who').set('Authorization', `Bearer ${tok({ id: 3, role: 'SuperAdmin' })}`);
    expect(res.status).toBe(401);
  });

  test('perubahan role berlaku segera setelah invalidateUser (tanpa menunggu TTL cache)', async () => {
    DB[4] = { id: 4, email: 'd@x.com', role: 'Admin' };
    const t = tok({ id: 4 });
    expect((await request(app).get('/admin').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    DB[4].role = 'Customer';
    invalidateUser(4);
    expect((await request(app).get('/admin').set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });

  test('DB error saat cek user -> 503 (fail closed), bukan lolos memakai role dari token', async () => {
    userModel.findUserById.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/admin').set('Authorization', `Bearer ${tok({ id: 5, role: 'SuperAdmin' })}`);
    expect(res.status).toBe(503);
  });

  test('hasil cek user di-cache (satu query untuk beberapa request)', async () => {
    DB[6] = { id: 6, email: 'f@x.com', role: 'Customer' };
    const t = tok({ id: 6 });
    await request(app).get('/who').set('Authorization', `Bearer ${t}`);
    await request(app).get('/who').set('Authorization', `Bearer ${t}`);
    expect(userModel.findUserById).toHaveBeenCalledTimes(1);
  });
});

describe('login', () => {
  const hash = bcrypt.hashSync('rahasia123', 4);
  test('email dinormalisasi huruf kecil sebelum dicari', async () => {
    userModel.findUserByEmail.mockResolvedValue({ id: 1, username: 'u', email: 'budi@x.com', password: hash, role: 'Customer' });
    const res = await request(app).post('/login').send({ email: '  Budi@X.com ', password: 'rahasia123' });
    expect(res.status).toBe(200);
    expect(userModel.findUserByEmail).toHaveBeenCalledWith('budi@x.com');
    expect(jwt.decode(res.body.token).id).toBe(1);
  });

  test('email tidak terdaftar & password salah memberi respons identik (tidak membocorkan email terdaftar)', async () => {
    userModel.findUserByEmail.mockResolvedValueOnce(null);
    const a = await request(app).post('/login').send({ email: 'nope@x.com', password: 'apa-saja' });
    userModel.findUserByEmail.mockResolvedValueOnce({ id: 1, email: 'budi@x.com', password: hash, role: 'Customer' });
    const b = await request(app).post('/login').send({ email: 'budi@x.com', password: 'salah-salah' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  test('password lama 6 karakter tetap bisa login (min 8 hanya untuk password baru)', () => {
    expect(loginSchema.safeParse({ email: 'a@x.com', password: '123456' }).success).toBe(true);
    expect(registerSchema.safeParse({ username: 'abc', email: 'a@x.com', password: '123456' }).success).toBe(false);
    expect(registerSchema.safeParse({ username: 'abc', email: 'a@x.com', password: 'x'.repeat(73) }).success).toBe(false);
  });

  test('error server tidak membocorkan pesan internal', async () => {
    userModel.findUserByEmail.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app).post('/login').send({ email: 'a@x.com', password: 'abcdefgh' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });
});

describe('ganti password', () => {
  test('password lama salah -> 401, tidak ada update', async () => {
    DB[7] = { id: 7, email: 'g@x.com', role: 'Customer' };
    userModel.getPasswordHashById.mockResolvedValue({ id: 7, password: bcrypt.hashSync('lama-lama-1', 4) });
    const res = await request(app).put('/pw').set('Authorization', `Bearer ${tok({ id: 7 })}`).send({ old_password: 'bukan-itu', new_password: 'baru-baru-1' });
    expect(res.status).toBe(401);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('sukses: password baru di-hash (bukan plaintext)', async () => {
    DB[8] = { id: 8, email: 'h@x.com', role: 'Customer' };
    userModel.getPasswordHashById.mockResolvedValue({ id: 8, password: bcrypt.hashSync('lama-lama-1', 4) });
    userModel.updateUser.mockResolvedValue({});
    const res = await request(app).put('/pw').set('Authorization', `Bearer ${tok({ id: 8 })}`).send({ old_password: 'lama-lama-1', new_password: 'baru-baru-1' });
    expect(res.status).toBe(200);
    const saved = userModel.updateUser.mock.calls[0][1].password;
    expect(saved).not.toBe('baru-baru-1');
    expect(bcrypt.compareSync('baru-baru-1', saved)).toBe(true);
  });

  test('password baru sama dengan yang lama / terlalu pendek -> 400', async () => {
    DB[9] = { id: 9, email: 'i@x.com', role: 'Customer' };
    const h = { Authorization: `Bearer ${tok({ id: 9 })}` };
    expect((await request(app).put('/pw').set(h).send({ old_password: 'sama-sama-1', new_password: 'sama-sama-1' })).status).toBe(400);
    expect((await request(app).put('/pw').set(h).send({ old_password: 'x', new_password: 'pendek' })).status).toBe(400);
  });
});
