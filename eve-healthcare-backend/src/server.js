const createApp = require('./app');
const { port } = require('./config/env');
const logger = require('./config/logger');
const { startWebhookRetryWorker } = require('./jobs/webhookRetryWorker');

const app = createApp();

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

let worker;
try {
  worker = startWebhookRetryWorker();
} catch (err) {
  logger.error('Failed to start webhook retry worker', { error: err.message });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  logger.info('Shutting down gracefully...');
  server.close(async () => {
    if (worker) await worker.close();
    process.exit(0);
  });
}

module.exports = server;
