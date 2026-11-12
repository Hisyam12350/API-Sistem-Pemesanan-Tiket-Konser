const request = require('supertest');
const app = require('../../app');
const pool = require('../../config/db');
const bcrypt = require('bcryptjs');
const userModel = require('../../models/userModel');

async function createTestUser(role = 'Customer') {
  const email = `test-${Date.now()}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: 'testuser', email, password: 'password123', role });
  return { ...res.body.data, email };
}

async function createAdminUser() {
  const email = `admin-${Date.now()}@example.com`;
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await userModel.createUser({
    username: 'adminuser',
    email,
    password: hashedPassword,
    role: 'Admin'
  });
  return user;
}

async function loginUser(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

async function createTestVenue(adminToken) {
  const venueRes = await request(app)
    .post('/api/venues')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ venue_type_id: 1, nama_venue: 'Test Venue', alamat: 'Test Address', kota: 'Jakarta' });
  return venueRes.body.data;
}

async function createTestEvent(adminToken, venueId) {
  const genreRes = await request(app)
    .get('/api/genres');
  
  const genreId = genreRes.body.data.length > 0 ? genreRes.body.data[0].id : 1;
  
  const eventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nama_event: 'Test Event',
      waktu_event: new Date(Date.now() + 86400000).toISOString(),
      venue_id: venueId,
      genre_id: genreId
    });
  return eventRes.body.data;
}

async function createTestTicketCategory(adminToken, eventId) {
  const res = await request(app)
    .post('/api/ticket-categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      event_id: eventId,
      nama_kategori: 'VIP',
      harga: 500000,
      kuota_total: 100
    });
  return res.body.data;
}

module.exports = { 
  request, 
  app, 
  pool,
  createTestUser, 
  createAdminUser,
  loginUser,
  createTestVenue,
  createTestEvent,
  createTestTicketCategory
};