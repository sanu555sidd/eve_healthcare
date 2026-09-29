jest.mock('../../db', () => ({
  query: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { jwtSecret } = require('../../src/config/env');
const authService = require('../../src/services/auth.service');

describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('signup creates a new user and returns a valid JWT', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Jane', email: 'jane@test.com', created_at: new Date().toISOString() }],
      });

    const { user, token } = await authService.signup({
      name: 'Jane',
      email: 'jane@test.com',
      password: 'password123',
    });

    expect(user.email).toBe('jane@test.com');
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, jwtSecret);
    expect(decoded.sub).toBe(1);
    expect(decoded.email).toBe('jane@test.com');
  });

  test('signup rejects a duplicate email with 409', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await expect(
      authService.signup({ name: 'Jane', email: 'jane@test.com', password: 'password123' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('login rejects an unknown email with 401', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(authService.login({ email: 'ghost@test.com', password: 'password123' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('login rejects an incorrect password with 401', async () => {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash('correct-password', 10);
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Jane', email: 'jane@test.com', password_hash: passwordHash }],
    });

    await expect(authService.login({ email: 'jane@test.com', password: 'wrong-password' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
