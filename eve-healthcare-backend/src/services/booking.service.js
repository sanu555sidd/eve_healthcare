const pool = require('../../db');
const ApiError = require('../utils/apiError');
const { getTestById } = require('./centre.service');
const { buildPaginatedResponse } = require('../utils/pagination');
const logger = require('../config/logger');

async function createBooking(userId, { testId, appointmentTime }) {
  const test = await getTestById(testId);

  const appointmentDate = new Date(appointmentTime);
  if (Number.isNaN(appointmentDate.getTime())) {
    throw new ApiError(400, 'appointmentTime must be a valid date');
  }
  if (appointmentDate.getTime() <= Date.now()) {
    throw new ApiError(400, 'appointmentTime must be in the future');
  }

  const result = await pool.query(
    `INSERT INTO bookings (user_id, test_id, centre_id, appointment_time, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')
     RETURNING *`,
    [userId, test.id, test.centre_id, appointmentDate.toISOString(), test.price]
  );

  logger.info('Booking created', { bookingId: result.rows[0].id, userId, testId: test.id });
  return result.rows[0];
}

async function getBookingById(bookingId) {
  const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  if (!result.rows[0]) throw new ApiError(404, 'Booking not found');
  return result.rows[0];
}

async function getOwnedBooking(bookingId, userId) {
  const booking = await getBookingById(bookingId);
  if (booking.user_id !== userId) {
    throw new ApiError(403, 'You are not authorized to access this booking');
  }
  return booking;
}

async function listUserBookings(userId, { page, limit, offset }) {
  const [rowsResult, countResult] = await Promise.all([
    pool.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3', [
      userId,
      limit,
      offset,
    ]),
    pool.query('SELECT COUNT(*)::int AS total FROM bookings WHERE user_id = $1', [userId]),
  ]);

  return buildPaginatedResponse({ rows: rowsResult.rows, total: countResult.rows[0].total, page, limit });
}

async function cancelBooking(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    const booking = result.rows[0];

    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.user_id !== userId) throw new ApiError(403, 'You are not authorized to modify this booking');
    if (['CANCELLED', 'CONFIRMED'].includes(booking.status)) {
      throw new ApiError(409, `Booking cannot be cancelled from status ${booking.status}`);
    }

    const updated = await client.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [bookingId]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createBooking, getBookingById, getOwnedBooking, listUserBookings, cancelBooking };
