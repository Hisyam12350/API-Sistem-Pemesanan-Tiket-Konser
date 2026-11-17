const { Pool } = require('pg');
const { logger } = require('../utils/logger');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.DB_SSL === 'true' || Boolean(connectionString);

// Koneksi TLS memverifikasi sertifikat server di production secara default. Untuk CA privat, set DB_SSL_CA.
// Verifikasi juga dapat diaktifkan di development/test dengan DB_SSL_REJECT_UNAUTHORIZED=true.
function sslConfig() {
  if (!useSsl) return false;
  const ca = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
  const strict = Boolean(ca)
    || process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: strict };
}

const poolConfig = connectionString
  ? { connectionString, ssl: sslConfig() }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'postgres',
      ssl: sslConfig()
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error({ err: err.message }, 'Unexpected error on idle PostgreSQL/Supabase client');
});

module.exports = pool;
