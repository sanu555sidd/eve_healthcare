jest.mock('../../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require('supertest');
const pool = require('../../db');
const createApp = require('../../src/app');

const app = createApp();

describe('Auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/auth/signup creates a user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Jane', email: 'jane@test.com', created_at: new Date().toISOString() }],
      });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Jane', email: 'jane@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('jane@test.com');
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/signup validates input and returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: '', email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test('POST /api/auth/signup rejects a duplicate email with 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Jane', email: 'jane@test.com', password: 'password123' });

    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login rejects invalid credentials with 401', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});
