const { Worker } = require('bullmq');
const { redisUrl } = require('../config/env');
const logger = require('../config/logger');
const { processWebhookEvent } = require('../services/webhook.service');

function connectionOptions() {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null };
}

function startWebhookRetryWorker() {
  const worker = new Worker(
    'webhook-retry',
    async (job) => {
      const { webhookEventId } = job.data;
      logger.info('Retrying webhook event processing', { webhookEventId, jobAttempt: job.attemptsMade });
      await processWebhookEvent(webhookEventId);
    },
    { connection: connectionOptions(), concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.info('Webhook retry job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.warn('Webhook retry job failed', { jobId: job && job.id, error: err.message });
  });

  return worker;
}

module.exports = { startWebhookRetryWorker };
