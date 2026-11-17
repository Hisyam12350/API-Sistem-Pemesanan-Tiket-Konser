// Env palsu untuk test keamanan (TANPA koneksi Supabase/Midtrans/DB sungguhan).
process.env.JWT_SECRET = 'jest-only-secret-' + 'x'.repeat(32);
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test-key';
process.env.MIDTRANS_IS_PRODUCTION = 'false';
