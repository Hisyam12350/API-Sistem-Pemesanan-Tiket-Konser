// Test keamanan: otorisasi PUT /api/users/:id dan registrasi publik.
// Semua dependensi DB di-mock, jadi test ini cepat dan tidak menyentuh Supabase.
require('./_env');

jest.mock('../../models/userModel');
const userModel = require('../../models/userModel');

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../config/jwt');
const userRoutes = require('../../routes/userRoutes');
const authRoutes = require('../../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

const tokenFor = (id, role) => jwt.sign({ id, email: `u${id}@x.com`, role }, JWT_SECRET, { expiresIn: '5m' });

const DB = {
  1: { id: 1, username: 'boss', email: 'boss@x.com', role: 'SuperAdmin' },
  2: { id: 2, username: 'adm', email: 'adm@x.com', role: 'Admin' },
  3: { id: 3, username: 'cust', email: 'cust@x.com', role: 'Customer' },
  4: { id: 4, username: 'cust2', email: 'cust2@x.com', role: 'Customer' },
  5: { id: 5, username: 'scan', email: 'scan@x.com', role: 'Scanner' }
};

beforeEach(() => {
  jest.resetAllMocks();
  userModel.findUserById.mockImplementation(async (id) => DB[Number(id)] || null);
  userModel.updateUser.mockImplementation(async (id, upd) => ({ ...DB[Number(id)], ...Object.fromEntries(Object.entries(upd).filter(([, v]) => v !== undefined && v !== null)) }));
});

const put = (actorId, actorRole, targetId, body) =>
  request(app).put(`/api/users/${targetId}`).set('Authorization', `Bearer ${tokenFor(actorId, actorRole)}`).send(body);

describe('PUT /api/users/:id — Customer', () => {
  test('TIDAK bisa menaikkan role dirinya sendiri menjadi SuperAdmin (eksploit #1)', async () => {
    const res = await put(3, 'Customer', 3, { role: 'SuperAdmin' });
    expect(res.status).toBe(403);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('TIDAK bisa mengganti password akun SuperAdmin / akun orang lain (account takeover)', async () => {
    const res = await put(3, 'Customer', 1, { password: 'hacked123' });
    expect(res.status).toBe(403);
    expect(userModel.updateUser).not.toHaveBeenCalled();
    // dan tidak membocorkan apakah ID itu ada
    expect(userModel.findUserById).not.toHaveBeenCalled();
  });

  test('boleh mengubah username/password akun sendiri', async () => {
    const res = await put(3, 'Customer', 3, { username: 'baru-nama', password: 'passwordbaru' });
    expect(res.status).toBe(200);
    const [, upd] = userModel.updateUser.mock.calls[0];
    expect(upd.username).toBe('baru-nama');
    expect(upd.password).toMatch(/^\$2[aby]\$/); // ter-hash bcrypt, bukan plaintext
    expect(upd.role).toBeUndefined();
  });

  test('mengirim role yang sama dengan role sekarang tidak error dan tidak mengubah role', async () => {
    const res = await put(3, 'Customer', 3, { username: 'abc', role: 'Customer' });
    expect(res.status).toBe(200);
    expect(userModel.updateUser.mock.calls[0][1].role).toBeUndefined();
  });

  test('field liar di body dibuang (tidak bisa menyelundupkan kolom lain)', async () => {
    const res = await put(3, 'Customer', 3, { username: 'abc', id: 1, created_at: 'x', is_admin: true });
    expect(res.status).toBe(200);
    expect(Object.keys(userModel.updateUser.mock.calls[0][1]).sort()).toEqual(['email', 'password', 'role', 'username']);
  });

  test('body kosong ditolak 400', async () => {
    const res = await put(3, 'Customer', 3, {});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/users/:id — Admin', () => {
  test('tidak boleh mengubah akun SuperAdmin', async () => {
    const res = await put(2, 'Admin', 1, { password: 'hacked123' });
    expect(res.status).toBe(403);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('tidak boleh menaikkan Customer menjadi Admin/SuperAdmin', async () => {
    expect((await put(2, 'Admin', 3, { role: 'Admin' })).status).toBe(403);
    expect((await put(2, 'Admin', 3, { role: 'SuperAdmin' })).status).toBe(403);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('tidak boleh menaikkan role dirinya sendiri', async () => {
    const res = await put(2, 'Admin', 2, { role: 'SuperAdmin' });
    expect(res.status).toBe(403);
  });

  test('boleh menjadikan Customer sebagai Scanner (alur resmi membuat akun scanner)', async () => {
    const res = await put(2, 'Admin', 3, { role: 'Scanner' });
    expect(res.status).toBe(200);
    expect(userModel.updateUser.mock.calls[0][1].role).toBe('Scanner');
  });
});

describe('PUT /api/users/:id — SuperAdmin', () => {
  test('boleh mengangkat Customer menjadi Admin', async () => {
    const res = await put(1, 'SuperAdmin', 3, { role: 'Admin' });
    expect(res.status).toBe(200);
    expect(userModel.updateUser.mock.calls[0][1].role).toBe('Admin');
  });

  test('tidak boleh mengubah role dirinya sendiri (anti terkunci)', async () => {
    const res = await put(1, 'SuperAdmin', 1, { role: 'Customer' });
    expect(res.status).toBe(403);
  });

  test('ID tidak valid -> 400, ID tidak ada -> 404', async () => {
    expect((await put(1, 'SuperAdmin', 'abc', { username: 'abc' })).status).toBe(400);
    expect((await put(1, 'SuperAdmin', 999, { username: 'abc' })).status).toBe(404);
  });

  test('email duplikat -> 409 (bukan 500)', async () => {
    userModel.updateUser.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await put(1, 'SuperAdmin', 3, { email: 'boss@x.com' });
    expect(res.status).toBe(409);
  });
});

describe('Scanner / tanpa token', () => {
  test('Scanner tidak punya akses ke PUT /api/users/:id', async () => {
    expect((await put(5, 'Scanner', 5, { username: 'abc' })).status).toBe(403);
  });
  test('tanpa token -> 401', async () => {
    const res = await request(app).put('/api/users/3').send({ role: 'SuperAdmin' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register — role dari klien diabaikan (eksploit #2)', () => {
  beforeEach(() => {
    userModel.findUserByEmail.mockResolvedValue(null);
    userModel.createUser.mockImplementation(async (u) => ({ id: 50, username: u.username, email: u.email, role: u.role }));
  });

  test.each(['Scanner', 'Admin', 'SuperAdmin', 'Customer'])('role "%s" dari klien -> akun tetap Customer', async (role) => {
    const res = await request(app).post('/api/auth/register').send({ username: 'penyerang', email: 'a@x.com', password: 'password123', role });
    expect(res.status).toBe(201);
    expect(userModel.createUser).toHaveBeenCalledTimes(1);
    expect(userModel.createUser.mock.calls[0][0].role).toBe('Customer');
    expect(res.body.user.role).toBe('Customer');
    expect(jwt.verify(res.body.token, JWT_SECRET).role).toBe('Customer');
  });

  test('registrasi tanpa role tetap Customer', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'biasa', email: 'b@x.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(userModel.createUser.mock.calls[0][0].role).toBe('Customer');
  });

  test('race email duplikat (unique DB) -> 400, bukan 500', async () => {
    userModel.createUser.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app).post('/api/auth/register').send({ username: 'biasa', email: 'b@x.com', password: 'password123' });
    expect(res.status).toBe(400);
  });
});
