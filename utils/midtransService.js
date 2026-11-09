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
  return data;
}

function verifySignature({ order_id, status_code, gross_amount, signature_key }) {
  const keysToTry = [getSignatureSecretKey(), getServerKey()].filter(Boolean);
  const normalizedAmount = String(Number(gross_amount));
  const base = order_id + status_code;

  for (const key of keysToTry) {
    const payloads = [
      base + gross_amount + key,
      base + normalizedAmount + key
    ];
    if (payloads.some((payload) =>
      crypto.createHash('sha512').update(payload).digest('hex') === signature_key
    )) return true;

    if ([gross_amount, normalizedAmount].some((amt) =>
      crypto.createHmac('sha512', key).update(base + amt).digest('hex') === signature_key
    )) return true;
  }

  return false;
}

function mapStatus(transaction_status) {
  switch (transaction_status) {
    case 'capture':
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
    case 'partial_refund':
      return 'cancelled';
    default:
      return 'pending';
  }
}

module.exports = { createTransaction, getTransactionStatus, verifySignature, mapStatus, isProduction };
