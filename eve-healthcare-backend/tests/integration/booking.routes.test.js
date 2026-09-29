jest.mock('../../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require('supertest');
const pool = require('../../db');
const createApp = require('../../src/app');
const { generateToken } = require('../../src/services/auth.service');

const app = createApp();
const token = generateToken({ id: 1, email: 'jane@test.com' });

describe('Booking routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
  });

  test('creates a booking for a valid, future appointment slot', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            name: 'CBC Test',
            price: '499.00',
            centre_id: 2,
            centre_name: 'City Diagnostics',
            centre_location: 'MG Road',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 1, test_id: 5, centre_id: 2, amount: '499.00', status: 'PENDING' }],
      });

    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: 5, appointmentTime: future });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  test('rejects booking for a non-existent test with 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: 999, appointmentTime: future });

    expect(res.status).toBe(404);
  });

  test('rejects booking with a past appointment time with 400', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'CBC Test', price: '499.00', centre_id: 2 }] });

    const past = new Date(Date.now() - 86400000).toISOString();
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: 5, appointmentTime: past });

    expect(res.status).toBe(400);
  });

  test('prevents a user from accessing another user booking (403)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, user_id: 999, status: 'PENDING' }] });

    const res = await request(app).get('/api/bookings/10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 for a booking id that does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/bookings/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('rejects an invalid (non-integer) booking id with 400', async () => {
    const res = await request(app).get('/api/bookings/not-a-number').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
