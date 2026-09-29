const Redis = require('ioredis');
const { redisUrl } = require('./env');
const logger = require('./logger');

const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

module.exports = redisClient;
