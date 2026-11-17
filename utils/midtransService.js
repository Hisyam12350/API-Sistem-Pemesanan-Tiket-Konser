const crypto = require('crypto');

function getServerKey() {
  return process.env.MIDTRANS_SERVER_KEY;
}

function getSignatureSecretKey() {
  return process.env.MIDTRANS_SIGNATURE_KEY || process.env.MIDTRANS_SERVER_KEY;
}

function isProduction() {
  return process.env.MIDTRANS_IS_PRODUCTION === 'true';
}

function snapBaseUrl() {
  return isProduction()
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
}

function apiBaseUrl() {
  return isProduction()
    ? 'https://api.midtrans.com/v2'
    : 'https://api.sandbox.midtrans.com/v2';
}

async function createTransaction(payload) {
  const serverKey = getServerKey();
  const auth = Buffer.from(serverKey + ':').toString('base64');
  const res = await fetch(snapBaseUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data && (data.error_messages || data.message) ? JSON.stringify(data.error_messages || data.message) : 'Midtrans API error');
    err.status = 502;
    throw err;
  }
  return data;
}

async function getTransactionStatus(orderId) {
  const serverKey = getServerKey();
  const auth = Buffer.from(serverKey + ':').toString('base64');
  const res = await fetch(`${apiBaseUrl()}/${orderId}/status`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    }
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data && (data.status_message || data.error_messages) ? JSON.stringify(data.status_message || data.error_messages) : 'Midtrans Status API error');
    err.status = res.status;
    throw err;
  }
  // Midtrans sering membalas HTTP 200 dengan status_code "404" di dalam body
  // (transaksi belum pernah dibuat/dipilih metode bayarnya). Jangan anggap itu data valid.
  if (data && String(data.status_code) === '404') {
    const err = new Error('Transaksi tidak ditemukan di Midtrans.');
    err.status = 404;
    throw err;
  }
  return data;
}

// Batalkan transaksi yang belum dibayar di Midtrans (dipanggil saat order dibatalkan user), supaya
// pembeli tidak bisa membayar order yang sudah dibatalkan. Best-effort: 404 (belum ada transaksi
// aktif) dianggap sukses; error lain dilempar agar pemanggil bisa mencatatnya.
async function cancelTransaction(orderId) {
  const serverKey = getServerKey();
  const auth = Buffer.from(serverKey + ':').toString('base64');
  const res = await fetch(`${apiBaseUrl()}/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` }
  });
  const data = await res.json().catch(() => ({}));
  const code = String(data && data.status_code);
  if (code === '404') return { cancelled: false, reason: 'not_found' };
  if (!res.ok || !['200', '412'].includes(code)) {
    const err = new Error('Gagal membatalkan transaksi di Midtrans.');
    err.status = 502;
    throw err;
  }
  return { cancelled: code === '200', data };
}

// Spesifikasi Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey)
// - gross_amount dipakai PERSIS seperti string yang diterima dari Midtrans (mis. "10000.00").
// - Perbandingan memakai timingSafeEqual agar tidak bocor lewat selisih waktu.
function verifySignature({ order_id, status_code, gross_amount, signature_key }) {
  if (
    typeof order_id !== 'string' ||
    typeof status_code !== 'string' ||
    typeof gross_amount !== 'string' ||
    typeof signature_key !== 'string' ||
    !/^[0-9a-f]{128}$/i.test(signature_key)
  ) {
    return false;
  }

  const received = Buffer.from(signature_key.toLowerCase(), 'hex');
  const keysToTry = [...new Set([getSignatureSecretKey(), getServerKey()].filter(Boolean))];

  for (const key of keysToTry) {
    const expected = crypto
      .createHash('sha512')
      .update(order_id + status_code + gross_amount + key)
      .digest();
    if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
      return true;
    }
  }

  return false;
}

function mapStatus(transaction_status, fraud_status) {
  switch (transaction_status) {
    case 'capture':
      // Pembayaran kartu: 'capture' baru benar-benar sukses bila fraud_status 'accept'.
      // 'challenge' = menunggu review manual di dashboard Midtrans (JANGAN terbitkan tiket).
      if (fraud_status === 'challenge') return 'pending';
      if (fraud_status === undefined || fraud_status === null || fraud_status === 'accept') return 'success';
      return 'failed';
    case 'settlement':
      return 'success';
    case 'pending':
      return 'pending';
    case 'deny':
      return 'failed';
    case 'cancel':
      return 'cancelled';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'chargeback':
      // Uang dikembalikan penuh ke pembeli -> tiket harus dibatalkan (lihat Payment.refundOrder).
      return 'refunded';
    case 'partial_refund':
    case 'partial_chargeback':
      // Hanya sebagian yang dikembalikan: tidak bisa diputuskan otomatis tiket mana yang batal.
      return 'partial_refund';
    default:
      return 'pending';
  }
}

module.exports = { createTransaction, getTransactionStatus, cancelTransaction, verifySignature, mapStatus, isProduction };
