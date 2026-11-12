const { createTestUser, loginUser } = require('./utils/testHelpers');
const request = require('supertest');
const app = require('../app');

describe('Auth Flow', () => {
  test('register new user', async () => {
    const user = await createTestUser('Customer');
    expect(user).toHaveProperty('id');
    expect(user.email).toMatch(/test-.*@example.com/);
  });

  test('login returns token', async () => {
    const email = `test-${Date.now()}@example.com`;
    await createTestUser('Customer');
    const token = await loginUser(email, 'password123');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  test('GET /me with valid token', async () => {
    const email = `test-${Date.now()}@example.com`;
    await createTestUser('Customer');
    const token = await loginUser(email, 'password123');
    
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });
});