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

describe('Payments Flow', () => {
  let customerToken;
  let adminToken;
  let customerId;
  let eventId;
  let ticketCategoryId;
  let seatIds;
  let orderId;

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
    
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seat_ids: [seatIds[0], seatIds[1]] });
    
    orderId = orderRes.body.data.order.id;
  });

  test('get payment status returns order with payments and tickets', async () => {
    const res = await request(app)
      .get(`/api/payments/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('order');
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('payments');
    expect(res.body.data).toHaveProperty('tickets');
  });

  test('reject payment for non-existent order', async () => {
    const res = await request(app)
      .post('/api/payments/999999/create')
      .set('Authorization', `Bearer ${customerToken}`);
    
    // Returns 404 when order not found, or 400 if validation fails
    expect([400, 404]).toContain(res.status);
  });
});