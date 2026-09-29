const { v4: uuidv4 } = require('uuid');
const pool = require('../../db');
const ApiError = require('../utils/apiError');
const { getOwnedBooking } = require('./booking.service');
const { paymentFailureRate } = require('../config/env');
const logger = require('../config/logger');

// Simulates a synchronous "pay now" call to a payment provider. In the real
// world this would call out to Stripe/Razorpay etc; here we flip a weighted
// coin and persist the outcome atomically with the booking status change.
async function simulatePayment(userId, { bookingId }) {
  // Ownership + existence check outside the transaction (fast fail, read-only).
  await getOwnedBooking(bookingId, userId);

  const isSuccess = Math.random() > paymentFailureRate;
  const providerPaymentId = uuidv4();
  const status = isSuccess ? 'SUCCESS' : 'FAILED';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-read with a row lock inside the transaction to guard against a
    // concurrent payment/webhook racing us between the check above and here.
    const lockedResult = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    const booking = lockedResult.rows[0];

    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.user_id !== userId) throw new ApiError(403, 'You are not authorized to access this booking');
    if (booking.status !== 'PENDING') {
      throw new ApiError(409, `Cannot pay for a booking with status ${booking.status}`);
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (booking_id, provider_payment_id, amount, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [bookingId, providerPaymentId, booking.amount, status]
    );

    const newBookingStatus = isSuccess ? 'CONFIRMED' : 'FAILED';
    const bookingResult = await client.query(
      `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newBookingStatus, bookingId]
    );

    await client.query('COMMIT');
    logger.info('Payment simulated', { bookingId, status, providerPaymentId });
    return { payment: paymentResult.rows[0], booking: bookingResult.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { simulatePayment };
