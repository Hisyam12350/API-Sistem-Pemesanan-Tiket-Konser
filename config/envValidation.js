const REQUIRED_ENVS = [
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY', // wajib: dengan RLS aktif, key publishable tidak bisa membaca tabel
  'DATABASE_URL',
  'MIDTRANS_SERVER_KEY'
];

// Server TIDAK boleh berjalan dengan konfigurasi tidak lengkap: sebelumnya hanya warning,
// sehingga server tetap hidup dengan secret bawaan / koneksi yang rusak.
function validateEnv() {
  const missing = REQUIRED_ENVS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ ENVIRONMENT ERROR: variabel wajib belum di-set:', missing.join(', '));
    console.error('   Lengkapi file .env (lihat .env.example), lalu jalankan ulang server.');
    process.exit(1);
  }
  console.log('✅ All required environment variables are set.');
}

module.exports = { validateEnv };
