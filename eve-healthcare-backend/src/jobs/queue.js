const { Queue } = require('bullmq');
const { redisUrl } = require('../config/env');
const logger = require('../config/logger');

function connectionOptions() {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    // BullMQ requires this to be null so it can manage retries itself.
    maxRetriesPerRequest: null,
  };
}

const webhookRetryQueue = new Queue('webhook-retry', { connection: connectionOptions() });

// Schedules a retry for a failed webhook event with capped exponential backoff.
async function enqueueWebhookRetry(webhookEventId, attempt) {
  const delayMs = Math.min(30000, 1000 * 2 ** attempt);
  await webhookRetryQueue.add(
    'retry-webhook',
    { webhookEventId },
    { delay: delayMs, removeOnComplete: true, removeOnFail: 100 }
  );
  logger.info('Enqueued webhook retry job', { webhookEventId, delayMs, attempt });
}

module.exports = { webhookRetryQueue, enqueueWebhookRetry };
