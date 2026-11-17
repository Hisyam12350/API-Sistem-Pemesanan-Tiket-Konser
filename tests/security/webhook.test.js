// Test keamanan: webhook Midtrans + util signature. Tanpa jaringan & tanpa DB.
require('./_env');

jest.mock('../../models/payments.js');
jest.mock('../../models/orders.js', () => ({}));
jest.mock('../../models/userModel.js', () => ({}));
// Pertahankan verifySignature & mapStatus ASLI; hanya panggilan jaringan yang di-mock.
jest.mock('../../utils/midtransService.js', () => ({
  ...jest.requireActual('../../utils/midtransService.js'),
  getTransactionStatus: jest.fn(),
  createTransaction: jest.fn()
}));

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const Payment = require('../../models/payments.js');
const midtrans = require('../../utils/midtransService.js');
const paymentRoutes = require('../../routes/paymentRoutes');

const app = express();
app.use(express.json());
app.use('/api/payments', paymentRoutes);

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const sign = (order_id, status_code, gross_amount, key = SERVER_KEY) =>
  crypto.createHash('sha512').update(order_id + status_code + gross_amount + key).digest('hex');

const TX = 'ORDER-10-1700000000000';
const notif = (over = {}) => {
  const base = { order_id: TX, status_code: '200', gross_amount: '150000.00', transaction_status: 'settlement' };
  const merged = { ...base, ...over };
  return { ...merged, signature_key: over.signature_key ?? sign(merged.order_id, merged.status_code, merged.gross_amount) };
};

beforeEach(() => {
  jest.resetAllMocks();
  Payment.findByTransactionId.mockResolvedValue({ id: 99, order_id: 10, transaction_id: TX, status: 'pending' });
  Payment.getOrderWithItems.mockResolvedValue({ order: { id: 10, status_order: 'pending', total_pembayaran: '150000' }, items: [] });
  Payment.settleOrderPaid.mockResolvedValue({ outcome: 'paid', tickets: [] });
  Payment.updatePayment.mockResolvedValue({});
  Payment.markOrderClosedIfPending.mockResolvedValue(true);
  midtrans.getTransactionStatus.mockResolvedValue({
    order_id: TX, status_code: '200', gross_amount: '150000.00', transaction_status: 'settlement', fraud_status: 'accept'
  });
});

describe('Webhook: pemalsuan notifikasi (eksploit #3)', () => {
  test('signature salah + body mengaku "settlement" -> 403 dan TIDAK ada order yang dilunasi', async () => {
    // Skenario penyerang: order & transaksi Snap miliknya sendiri, API Midtrans menjawab order_id+amount cocok (status pending).
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '201', gross_amount: '150000.00', transaction_status: 'pending' });
    const res = await request(app).post('/api/payments/notification').send(notif({ signature_key: 'x'.repeat(128) }));
    expect(res.status).toBe(403);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
    expect(Payment.updatePayment).not.toHaveBeenCalled();
    expect(midtrans.getTransactionStatus).not.toHaveBeenCalled(); // tidak ada lagi jalur "fallback via API"
  });

  test('signature dibuat dengan server key yang salah -> 403', async () => {
    const res = await request(app).post('/api/payments/notification')
      .send(notif({ signature_key: sign(TX, '200', '150000.00', 'kunci-penyerang') }));
    expect(res.status).toBe(403);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
  });

  test('signature tanpa field / tipe aneh -> 400/403, tidak crash', async () => {
    expect((await request(app).post('/api/payments/notification').send({})).status).toBe(400);
    const res = await request(app).post('/api/payments/notification').send({ order_id: TX, status_code: 200, gross_amount: 150000, signature_key: { $ne: 1 } });
    expect(res.status).toBe(403);
  });

  test('signature VALID tetapi API Midtrans bilang masih pending -> order TIDAK dilunasi (body tidak dipercaya)', async () => {
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '201', gross_amount: '150000.00', transaction_status: 'pending' });
    const res = await request(app).post('/api/payments/notification').send(notif({ transaction_status: 'settlement' }));
    expect(res.status).toBe(200);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
    expect(Payment.updatePayment).toHaveBeenCalledWith(99, { status: 'pending' });
  });

  test('API Midtrans gagal -> 502 (Midtrans akan kirim ulang), tidak melunasi', async () => {
    midtrans.getTransactionStatus.mockRejectedValue(new Error('timeout'));
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(502);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
  });

  test('jumlah dari Midtrans tidak sama dengan total order -> 400', async () => {
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '200', gross_amount: '1000.00', transaction_status: 'settlement' });
    const res = await request(app).post('/api/payments/notification').send(notif({ gross_amount: '1000.00' }));
    expect(res.status).toBe(400);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
  });
});

describe('Webhook: alur sah', () => {
  test('signature valid + API Midtrans settlement -> settle atomik dipanggil sekali', async () => {
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(200);
    expect(Payment.settleOrderPaid).toHaveBeenCalledTimes(1);
    expect(Payment.settleOrderPaid).toHaveBeenCalledWith(10);
    expect(Payment.updatePayment).toHaveBeenCalledWith(99, { status: 'success' });
  });

  test('notifikasi duplikat tetap idempoten (settle dipanggil lagi tapi aman: already_paid)', async () => {
    Payment.findByTransactionId.mockResolvedValue({ id: 99, order_id: 10, transaction_id: TX, status: 'success' });
    Payment.settleOrderPaid.mockResolvedValue({ outcome: 'already_paid', tickets: [] });
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(200);
  });

  test('kartu "capture" dengan fraud_status=challenge TIDAK menerbitkan tiket', async () => {
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '201', gross_amount: '150000.00', transaction_status: 'capture', fraud_status: 'challenge' });
    const res = await request(app).post('/api/payments/notification').send(notif({ status_code: '201', transaction_status: 'capture' }));
    expect(res.status).toBe(200);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
  });

  test('notifikasi expire menutup order pending, tapi tidak menimpa pembayaran yang sudah sukses', async () => {
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '202', gross_amount: '150000.00', transaction_status: 'expire' });
    await request(app).post('/api/payments/notification').send(notif({ status_code: '202', transaction_status: 'expire' }));
    expect(Payment.markOrderClosedIfPending).toHaveBeenCalledWith(10, 'expired');

    jest.clearAllMocks();
    Payment.findByTransactionId.mockResolvedValue({ id: 99, order_id: 10, transaction_id: TX, status: 'success' });
    Payment.getOrderWithItems.mockResolvedValue({ order: { id: 10, status_order: 'paid', total_pembayaran: '150000' }, items: [] });
    midtrans.getTransactionStatus.mockResolvedValue({ order_id: TX, status_code: '202', gross_amount: '150000.00', transaction_status: 'expire' });
    const res = await request(app).post('/api/payments/notification').send(notif({ status_code: '202', transaction_status: 'expire' }));
    expect(res.status).toBe(200);
    expect(Payment.markOrderClosedIfPending).not.toHaveBeenCalled();
    expect(Payment.updatePayment).not.toHaveBeenCalled();
  });
});

describe('midtransService.verifySignature / mapStatus', () => {
  const { verifySignature, mapStatus } = jest.requireActual('../../utils/midtransService.js');

  test('menerima signature yang benar, menolak yang diubah 1 karakter', () => {
    const good = sign(TX, '200', '150000.00');
    expect(verifySignature({ order_id: TX, status_code: '200', gross_amount: '150000.00', signature_key: good })).toBe(true);
    const bad = (good[0] === 'a' ? 'b' : 'a') + good.slice(1);
    expect(verifySignature({ order_id: TX, status_code: '200', gross_amount: '150000.00', signature_key: bad })).toBe(false);
  });

  test('gross_amount harus persis sama dengan yang ditandatangani', () => {
    const good = sign(TX, '200', '150000.00');
    expect(verifySignature({ order_id: TX, status_code: '200', gross_amount: '150000', signature_key: good })).toBe(false);
  });

  test('mapStatus: capture+challenge=pending, capture+accept=success, capture+deny=failed', () => {
    expect(mapStatus('capture', 'challenge')).toBe('pending');
    expect(mapStatus('capture', 'accept')).toBe('success');
    expect(mapStatus('capture', 'deny')).toBe('failed');
    expect(mapStatus('settlement')).toBe('success');
    expect(mapStatus('expire')).toBe('expired');
  });
});

describe('Webhook: refund, bayar terlambat, partial refund', () => {
  const settle = (status, extra = {}) => midtrans.getTransactionStatus.mockResolvedValue({
    order_id: TX, status_code: '200', gross_amount: '150000.00', transaction_status: status, fraud_status: 'accept', ...extra
  });

  test('refund penuh -> Payment.refundOrder dipanggil, payment ditandai refunded', async () => {
    settle('refund');
    Payment.refundOrder.mockResolvedValue({ outcome: 'refunded', cancelled_tickets: 2, already_scanned_tickets: 0 });
    const res = await request(app).post('/api/payments/notification').send(notif({ transaction_status: 'refund' }));
    expect(res.status).toBe(200);
    expect(Payment.refundOrder).toHaveBeenCalledWith(10);
    expect(Payment.updatePayment).toHaveBeenCalledWith(99, { status: 'refunded', needs_refund: false });
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
  });

  test('chargeback diperlakukan sama seperti refund', async () => {
    settle('chargeback');
    Payment.refundOrder.mockResolvedValue({ outcome: 'refunded', cancelled_tickets: 1, already_scanned_tickets: 0 });
    expect((await request(app).post('/api/payments/notification').send(notif())).status).toBe(200);
    expect(Payment.refundOrder).toHaveBeenCalled();
  });

  test('partial refund TIDAK membatalkan tiket otomatis', async () => {
    settle('partial_refund');
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(200);
    expect(Payment.refundOrder).not.toHaveBeenCalled();
    expect(Payment.updatePayment).not.toHaveBeenCalled();
  });

  test('bayar terlambat (order sudah expired) -> payment ditandai needs_refund, tidak ada tiket', async () => {
    Payment.settleOrderPaid.mockResolvedValue({ outcome: 'late', order_status: 'expired' });
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(200);
    expect(Payment.updatePayment).toHaveBeenCalledWith(99, { status: 'success', needs_refund: true });
  });

  test('notifikasi settlement yang datang terlambat untuk payment yang sudah refunded diabaikan (tidak "menghidupkan" kembali)', async () => {
    Payment.findByTransactionId.mockResolvedValue({ id: 99, order_id: 10, transaction_id: TX, status: 'refunded' });
    const res = await request(app).post('/api/payments/notification').send(notif());
    expect(res.status).toBe(200);
    expect(Payment.settleOrderPaid).not.toHaveBeenCalled();
    expect(Payment.updatePayment).not.toHaveBeenCalled();
  });

  test('mapStatus: refund/chargeback -> refunded, partial -> partial_refund, capture+challenge -> pending', () => {
    const { mapStatus } = jest.requireActual('../../utils/midtransService.js');
    expect(mapStatus('refund')).toBe('refunded');
    expect(mapStatus('chargeback')).toBe('refunded');
    expect(mapStatus('partial_refund')).toBe('partial_refund');
    expect(mapStatus('capture', 'challenge')).toBe('pending');
    expect(mapStatus('capture', 'accept')).toBe('success');
  });
});
