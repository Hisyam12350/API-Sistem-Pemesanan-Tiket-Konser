const pool = require('../config/db');

beforeAll(async () => {
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