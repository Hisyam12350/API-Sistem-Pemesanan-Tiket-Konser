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

describe('Orders Flow', () => {
  let customerToken;
  let adminToken;
  let customerId;
  let eventId;
  let ticketCategoryId;
  let seatIds;

  beforeAll(async () => {
    const customer = await createTestUser('Customer');
    customerId = customer.id;
    customerToken = await loginUser(customer.email, 'password123');

    const adminUser = await createAdminUser();
    adminToken = await loginUser(adminUser.email, 'password123');

    const venue = await createTestVenue(adminToken);
    const event = await createTestEvent(adminToken, venue.id);
    eventId = event.id;

    const ticketCategory = await createTestTicketCategory(adminToken, eventId);
    ticketCategoryId = ticketCategory.id;

    const seatRes = await request(app)
      .post('/api/seats/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kategori_id: ticketCategoryId,
        jumlah: 5,
        prefix: 'A',
        start_number: 1
      });
    
    seatIds = seatRes.body.data.map(s => s.id);
    
    // Lock seats for customer
    await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: seatIds,
        minutes: 15
      });
  });

  test('create order with valid seats', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [seatIds[0], seatIds[1]] });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order).toHaveProperty('id');
    // seat_ids are returned as strings
    expect(res.body.data.items[0].seat_ids.map(String)).toEqual([String(seatIds[0]), String(seatIds[1])]);
  });

  test('get orders list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('get order by id', async () => {
    // Need to lock more seats for this test
    const extraSeatRes = await request(app)
      .post('/api/seats/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kategori_id: ticketCategoryId,
        jumlah: 2,
        prefix: 'B',
        start_number: 1
      });
    
    const extraSeatIds = extraSeatRes.body.data.map(s => s.id);
    
    await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: [extraSeatIds[0]],
        minutes: 15
      });
    
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [extraSeatIds[0]] });
    
    const orderId = createRes.body.data.order.id;
    
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order.id).toBe(orderId);
  });

  test('cancel order', async () => {
    // Need to lock more seats for this test
    const extraSeatRes = await request(app)
      .post('/api/seats/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kategori_id: ticketCategoryId,
        jumlah: 2,
        prefix: 'C',
        start_number: 1
      });
    
    const extraSeatIds = extraSeatRes.body.data.map(s => s.id);
    
    await request(app)
      .post('/api/seats/lock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        seat_ids: [extraSeatIds[0]],
        minutes: 15
      });
    
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [extraSeatIds[0]] });
    
    const orderId = createRes.body.data.order.id;
    
    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('reject order with invalid seat', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [999999] });
    
    expect(res.status).toBe(409);
  });

  test('reject order with empty seat_ids', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [] });
    
    expect(res.status).toBe(400);
  });
});