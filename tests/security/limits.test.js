// Test: batas jumlah kursi, validator seat/order, dan model order/kursi (pg di-mock).
require('./_env');
const { MAX_SEATS_PER_ORDER } = require('../../config/limits');
const { createOrderSchema } = require('../../validators/orderValidator');
const { lockSeatsSchema, unlockSeatsSchema } = require('../../validators/seatValidator');

const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('batas kursi per permintaan', () => {
  test(`order > ${MAX_SEATS_PER_ORDER} kursi ditolak validator`, () => {
    expect(createOrderSchema.safeParse({ seat_ids: ids(MAX_SEATS_PER_ORDER) }).success).toBe(true);
    expect(createOrderSchema.safeParse({ seat_ids: ids(MAX_SEATS_PER_ORDER + 1) }).success).toBe(false);
    expect(createOrderSchema.safeParse({ seat_ids: ids(5000) }).success).toBe(false);
  });
  test('lock/unlock > batas ditolak; minutes > MAX ditolak', () => {
    expect(lockSeatsSchema.safeParse({ seat_ids: ids(MAX_SEATS_PER_ORDER + 1) }).success).toBe(false);
    expect(unlockSeatsSchema.safeParse({ seat_ids: ids(MAX_SEATS_PER_ORDER + 1) }).success).toBe(false);
    expect(lockSeatsSchema.safeParse({ seat_ids: [1], minutes: 10000 }).success).toBe(false);
    expect(lockSeatsSchema.safeParse({ seat_ids: [1], minutes: 10 }).success).toBe(true);
  });
  test('seat_id bukan angka positif ditolak', () => {
    expect(createOrderSchema.safeParse({ seat_ids: ['abc'] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ seat_ids: [-1] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ seat_ids: [] }).success).toBe(false);
  });
});

describe('Order.createOrder (pg di-mock)', () => {
  jest.resetModules();
  const client = { query: jest.fn(), release: jest.fn() };
  jest.doMock('../../config/db.js', () => ({ connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [{ id: 1 }] })) }));
  const Order = require('../../models/orders.js');

  beforeEach(() => { client.query.mockReset(); client.release.mockReset(); });

  test('duplikat seat_id dibuang sebelum query; > batas ditolak tanpa menyentuh DB', async () => {
    await expect(Order.createOrder({ customer_id: 1, seat_ids: ids(MAX_SEATS_PER_ORDER + 1) })).rejects.toMatchObject({ status: 400 });
    expect(client.query).not.toHaveBeenCalled();
  });

  test('ROLLBACK yang gagal (koneksi putus) tidak menutupi error aslinya', async () => {
    client.query.mockImplementation(async (sql) => {
      if (/ROLLBACK/.test(sql)) throw new Error('connection terminated');
      if (/^BEGIN/.test(sql)) return {};
      if (/UPDATE orders SET status_order='expired'/.test(sql)) return {};
      return { rows: [] }; // kursi tidak ditemukan -> 409
    });
    await expect(Order.createOrder({ customer_id: 1, seat_ids: [1, 1, 2] })).rejects.toMatchObject({ status: 409, message: 'Beberapa kursi tidak ditemukan.' });
    expect(client.release).toHaveBeenCalled();
  });

  test('kursi dari dua event berbeda dalam satu order ditolak (400)', async () => {
    const future = new Date(Date.now() + 600000).toISOString();
    const mk = (id, event_id) => ({ id, kategori_id: 1, status_kursi: 'locked', locked_by: 1, locked_until: future, event_id, sales_open: true });
    client.query.mockImplementation(async (sql) => {
      if (/FOR UPDATE OF s/.test(sql)) return { rows: [mk(1, 10), mk(2, 11)] };
      return { rows: [] };
    });
    await expect(Order.createOrder({ customer_id: 1, seat_ids: [1, 2] })).rejects.toMatchObject({ status: 400 });
  });

  test('penjualan ditutup (event sudah lewat/completed) -> 409', async () => {
    const future = new Date(Date.now() + 600000).toISOString();
    client.query.mockImplementation(async (sql) => {
      if (/FOR UPDATE OF s/.test(sql)) return { rows: [{ id: 1, kategori_id: 1, status_kursi: 'locked', locked_by: 1, locked_until: future, event_id: 10, sales_open: false }] };
      return { rows: [] };
    });
    await expect(Order.createOrder({ customer_id: 1, seat_ids: [1] })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/ditutup/) });
  });
});
