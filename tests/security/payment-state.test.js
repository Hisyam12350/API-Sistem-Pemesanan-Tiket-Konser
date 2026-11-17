require('./_env');

jest.mock('../../config/db', () => ({ query: jest.fn() }));
const pool = require('../../config/db');
const Payment = require('../../models/payments');

beforeEach(() => {
  pool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
});

test('success tidak dapat menimpa payment yang sudah refunded', async () => {
  await Payment.updatePayment(12, { status: 'success' });
  expect(pool.query.mock.calls[0][0]).toContain("AND status <> 'refunded'");
});

test('status non-final hanya dapat memperbarui payment yang masih pending', async () => {
  await Payment.updatePayment(12, { status: 'failed' });
  expect(pool.query.mock.calls[0][0]).toContain("AND status = 'pending'");
});

test('notifikasi pending terlambat tidak dapat menghidupkan payment failed/expired', async () => {
  await Payment.updatePayment(12, { status: 'pending' });
  expect(pool.query.mock.calls[0][0]).toContain("AND status = 'pending'");
});

test('refunded dapat menjadi status final setelah success', async () => {
  await Payment.updatePayment(12, { status: 'refunded' });
  expect(pool.query.mock.calls[0][0]).not.toContain('AND status');
});