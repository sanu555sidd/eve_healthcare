process.env.WEBHOOK_FAILURE_SIMULATION_RATE = '0';

jest.mock('../../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require('supertest');
const pool = require('../../db');
const createApp = require('../../src/app');

const app = createApp();

describe('Payment webhook (idempotency & edge cases)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes a brand-new webhook event and confirms the booking', async () => {
    // INSERT ... ON CONFLICT DO NOTHING RETURNING * -> a new row was inserted
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, event_id: 'evt_1', payload: { eventId: 'evt_1', bookingId: 10, status: 'SUCCESS' } }],
    });

    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM webhook_events WHERE id')) {
        return {
          rows: [
            {
              id: 1,
              status: 'PENDING',
              attempts: 0,
              payload: { eventId: 'evt_1', bookingId: 10, status: 'SUCCESS' },
            },
          ],
        };
      }
      if (sql.includes('FROM bookings WHERE id')) return { rows: [{ id: 10, status: 'PENDING' }] };
      if (sql.includes('UPDATE bookings SET status')) return { rows: [] };
      if (sql.includes("UPDATE webhook_events SET status = 'PROCESSED'")) return { rows: [] };
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: 'evt_1', bookingId: 10, status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/processed/i);
  });

  test('treats a duplicate event id as an idempotent no-op', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // ON CONFLICT DO NOTHING -> duplicate, nothing inserted
      .mockResolvedValueOnce({ rows: [{ id: 1, event_id: 'evt_1', status: 'PROCESSED' }] }); // fetch existing event

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: 'evt_1', bookingId: 10, status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already processed/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('validates the webhook payload and rejects malformed requests with 400', async () => {
    const res = await request(app).post('/api/payments/webhook').send({ eventId: '', bookingId: 'abc', status: 'WEIRD' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when the webhook references a booking that does not exist', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 2, event_id: 'evt_2', payload: { eventId: 'evt_2', bookingId: 9999, status: 'SUCCESS' } }],
    });

    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM webhook_events WHERE id')) {
        return {
          rows: [{ id: 2, status: 'PENDING', attempts: 0, payload: { eventId: 'evt_2', bookingId: 9999, status: 'SUCCESS' } }],
        };
      }
      if (sql.includes('FROM bookings WHERE id')) return { rows: [] };
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: 'evt_2', bookingId: 9999, status: 'SUCCESS' });

    expect(res.status).toBe(404);
  });
});
