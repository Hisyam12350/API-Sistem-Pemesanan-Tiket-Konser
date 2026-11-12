const { 
  createTestUser, 
  createAdminUser,
  loginUser, 
  createTestVenue, 
  createTestEvent, 
  createTestTicketCategory,
  app 
} = require('./utils/testHelpers');
const request = require('supertest');

describe('Seats Flow', () => {
  let adminToken;
  let customerToken;
  let eventId;
  let ticketCategoryId;

  beforeAll(async () => {
    const adminUser = await createAdminUser();
    adminToken = await loginUser(adminUser.email, 'password123');

    const customer = await createTestUser('Customer');
    customerToken = await loginUser(customer.email, 'password123');

    const venue = await createTestVenue(adminToken);
    const event = await createTestEvent(adminToken, venue.id);
    eventId = event.id;

    const ticketCategory = await createTestTicketCategory(adminToken, eventId);
    ticketCategoryId = ticketCategory.id;
  });

  test('generate seats for ticket category', async () => {
    const res = await request(app)
      .post('/api/seats/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kategori_id: ticketCategoryId,
        jumlah: 3,
        prefix: 'A',
        start_number: 1
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('nomor_kursi');
  });

  test('get seats by category', async () => {
    const res = await request(app)
      .get(`/api/seats?kategori_id=${ticketCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('lock seats', async () => {
    const seatsRes = await request(app)
      .get(`/api/seats?kategori_id=${ticketCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    const seatIds = seatsRes.body.data.slice(0, 2).map(s => s.id);
    
    const res = await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: seatIds,
        minutes: 15
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.seats).toHaveLength(2);
  });

  test('unlock seats', async () => {
    const seatsRes = await request(app)
      .get(`/api/seats?kategori_id=${ticketCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    const seatIds = seatsRes.body.data.slice(0, 1).map(s => s.id);
    
    await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: seatIds,
        minutes: 15
      });
    
    const res = await request(app)
      .post('/api/seats/unlock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: seatIds });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.unlocked).toHaveLength(1);
  });

  test('reject lock for already locked seat', async () => {
    const seatsRes = await request(app)
      .get(`/api/seats?kategori_id=${ticketCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    const seatIds = seatsRes.body.data.slice(0, 1).map(s => s.id);
    
    await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: seatIds,
        minutes: 15
      });
    
    const res = await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: seatIds,
        minutes: 15
      });
    
    expect(res.status).toBe(409);
  });
});