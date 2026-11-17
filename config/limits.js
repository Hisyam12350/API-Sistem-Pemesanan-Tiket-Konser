// Batas & aturan bisnis yang bisa diatur lewat .env (semua punya default aman).
const intFromEnv = (name, fallback, { min = 1, max = 1000 } = {}) => {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

module.exports = {
  // Maksimal kursi dalam SATU order, sekaligus batas kursi yang boleh ditahan (di-lock) satu user per event.
  // Mencegah "hoarding": satu akun mengunci ratusan kursi sehingga orang lain tidak kebagian.
  MAX_SEATS_PER_ORDER: intFromEnv('MAX_SEATS_PER_ORDER', 6, { max: 50 }),

  // Lama waktu untuk membayar setelah order dibuat (menit).
  ORDER_PAYMENT_MINUTES: intFromEnv('ORDER_PAYMENT_MINUTES', 15, { min: 2, max: 120 }),

  // Lama lock kursi default & maksimum (menit) saat memilih kursi sebelum membuat order.
  DEFAULT_LOCK_MINUTES: intFromEnv('DEFAULT_LOCK_MINUTES', 15, { max: 60 }),
  MAX_LOCK_MINUTES: intFromEnv('MAX_LOCK_MINUTES', 60, { max: 120 }),

  // Check-in dibuka sekian jam SEBELUM waktu event dimulai, dan ditutup sekian jam SETELAH mulai.
  CHECKIN_OPENS_HOURS_BEFORE: intFromEnv('CHECKIN_OPENS_HOURS_BEFORE', 6, { max: 72 }),
  CHECKIN_CLOSES_HOURS_AFTER: intFromEnv('CHECKIN_CLOSES_HOURS_AFTER', 12, { max: 72 })
};
