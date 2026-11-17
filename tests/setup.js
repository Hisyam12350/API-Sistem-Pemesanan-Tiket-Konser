const pool = require('../config/db');

beforeAll(async () => {
  if (process.env.SKIP_DB_SETUP === 'true') return;
  try {
    const client = await pool.connect();
    client.release(true);
  } catch (e) {
    console.warn('PostgreSQL Pool connection notice:', e.message);
  }
});

afterAll(async () => {
  await pool.end();
});