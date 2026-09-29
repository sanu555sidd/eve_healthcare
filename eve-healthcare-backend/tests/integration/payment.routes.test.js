process.env.PAYMENT_FAILURE_RATE = '0';

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

describe('Payment routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects paying for a booking owned by another user with 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, user_id: 999, status: 'PENDING' }] });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 10 });

    expect(res.status).toBe(403);
  });

  test('rejects paying for an already-confirmed booking with 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, user_id: 1, status: 'CONFIRMED' }] });
    pool.connect.mockResolvedValue({
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
        if (sql.includes('FROM bookings WHERE id')) return { rows: [{ id: 10, user_id: 1, status: 'CONFIRMED' }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 10 });

    expect(res.status).toBe(409);
  });

  test('successfully simulates a payment and confirms the booking', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, user_id: 1, status: 'PENDING', amount: '499.00' }] });

    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM bookings WHERE id')) return { rows: [{ id: 10, user_id: 1, status: 'PENDING', amount: '499.00' }] };
      if (sql.includes('INSERT INTO payments')) return { rows: [{ id: 1, booking_id: 10, status: 'SUCCESS' }] };
      if (sql.includes('UPDATE bookings SET status')) return { rows: [{ id: 10, status: 'CONFIRMED' }] };
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 10 });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('CONFIRMED');
    expect(res.body.payment.status).toBe('SUCCESS');
  });

  test('validates that bookingId is required', async () => {
    const res = await request(app).post('/api/payments').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});
