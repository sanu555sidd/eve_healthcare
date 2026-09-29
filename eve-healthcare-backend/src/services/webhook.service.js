const pool = require('../../db');
const ApiError = require('../utils/apiError');
const logger = require('../config/logger');
const { webhookFailureSimulationRate } = require('../config/env');
const { enqueueWebhookRetry } = require('../jobs/queue');

const MAX_ATTEMPTS = 5;

// Entry point for POST /payments/webhook. Guarantees idempotency: the same
// event_id can be delivered any number of times and will only ever be
// applied once, thanks to the UNIQUE constraint on webhook_events.event_id.
async function receiveWebhook({ eventId, bookingId, status }) {
  if (!['SUCCESS', 'FAILED'].includes(status)) {
    throw new ApiError(400, 'status must be SUCCESS or FAILED');
  }

  const insertResult = await pool.query(
    `INSERT INTO webhook_events (event_id, booking_id, payload, status)
     VALUES ($1, $2, $3, 'PENDING')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING *`,
    [eventId, bookingId, JSON.stringify({ eventId, bookingId, status })]
  );

  if (insertResult.rows.length === 0) {
    // event_id already exists -> this is a duplicate delivery. Do not
    // reprocess; just report what happened last time.
    const existing = await pool.query('SELECT * FROM webhook_events WHERE event_id = $1', [eventId]);
    logger.info('Duplicate webhook event received, skipping reprocessing', { eventId });
    return { duplicate: true, event: existing.rows[0] };
  }

  const event = insertResult.rows[0];

  try {
    const processed = await processWebhookEvent(event.id);
    return { duplicate: false, queued: false, event: processed };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Transient failure: a retry has already been scheduled inside
    // handleProcessingFailure(). Report back that processing is deferred
    // rather than surfacing a 500 to the (simulated) payment provider.
    return { duplicate: false, queued: true, event };
  }
}

// Applies a single webhook event to its booking. Safe to call multiple
// times for the same event id (used both for the initial attempt and for
// retries picked up by the BullMQ worker).
async function processWebhookEvent(webhookEventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query('SELECT * FROM webhook_events WHERE id = $1 FOR UPDATE', [
      webhookEventId,
    ]);
    const event = eventResult.rows[0];
    if (!event) throw new ApiError(404, 'Webhook event not found');

    if (event.status === 'PROCESSED') {
      await client.query('COMMIT');
      return event;
    }

    const payload = event.payload;
    const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [
      payload.bookingId,
    ]);
    const booking = bookingResult.rows[0];
    if (!booking) {
      throw new ApiError(404, `Booking ${payload.bookingId} referenced by webhook not found`);
    }

    // Simulates a transient downstream failure (timeout, deadlock, etc.) so
    // the retry pipeline has something real to exercise.
    if (Math.random() < webhookFailureSimulationRate) {
      throw new Error('Simulated transient processing failure');
    }

    if (['CONFIRMED', 'CANCELLED'].includes(booking.status)) {
      // Booking already resolved (e.g. by a direct /payments/ call) -
      // treat as a safe no-op rather than corrupting its state.
      await client.query(
        `UPDATE webhook_events SET status = 'PROCESSED', processed_at = NOW(), attempts = attempts + 1 WHERE id = $1`,
        [webhookEventId]
      );
      await client.query('COMMIT');
      return { ...event, status: 'PROCESSED' };
    }

    const newBookingStatus = payload.status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';
    await client.query(`UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2`, [
      newBookingStatus,
      booking.id,
    ]);
    await client.query(
      `UPDATE webhook_events SET status = 'PROCESSED', processed_at = NOW(), attempts = attempts + 1 WHERE id = $1`,
      [webhookEventId]
    );

    await client.query('COMMIT');
    logger.info('Webhook event processed', { webhookEventId, bookingId: booking.id, newBookingStatus });
    return { ...event, status: 'PROCESSED' };
  } catch (err) {
    await client.query('ROLLBACK');
    if (!(err instanceof ApiError)) {
      await handleProcessingFailure(webhookEventId, err);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function handleProcessingFailure(webhookEventId, err) {
  const result = await pool.query(
    `UPDATE webhook_events SET status = 'FAILED', attempts = attempts + 1, last_error = $2 WHERE id = $1 RETURNING *`,
    [webhookEventId, err.message]
  );
  const event = result.rows[0];

  if (event && event.attempts < MAX_ATTEMPTS) {
    logger.warn('Webhook processing failed, scheduling retry', {
      webhookEventId,
      attempts: event.attempts,
      error: err.message,
    });
    await enqueueWebhookRetry(webhookEventId, event.attempts);
  } else {
    logger.error('Webhook processing exhausted retries', { webhookEventId, error: err.message });
  }
}

module.exports = { receiveWebhook, processWebhookEvent, MAX_ATTEMPTS };
