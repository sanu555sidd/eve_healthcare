const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const ApiError = require('../utils/apiError');

const SALT_ROUNDS = 10;

async function signup({ name, email, password }) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [name, email, passwordHash]
  );

  const user = result.rows[0];
  return { user, token: generateToken(user) };
}

async function login({ email, password }) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  // Same error for "no such user" and "wrong password" to avoid leaking
  // whether an email is registered.
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
  return { user: safeUser, token: generateToken(safeUser) };
}

function generateToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

module.exports = { signup, login, generateToken };
