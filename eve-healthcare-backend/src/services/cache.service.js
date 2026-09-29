const redisClient = require('../config/redis');
const logger = require('../config/logger');

const DEFAULT_TTL_SECONDS = 60;

async function getCache(key) {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.warn('Cache get failed, falling back to source of truth', { key, error: err.message });
    return null;
  }
}

async function setCache(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('Cache set failed', { key, error: err.message });
  }
}

// Invalidates every cached key under a given prefix (e.g. after a write that
// makes list/detail caches stale).
async function invalidateByPrefix(prefix) {
  try {
    const stream = redisClient.scanStream({ match: `${prefix}*` });
    const keysToDelete = [];
    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }
    if (keysToDelete.length) {
      await redisClient.del(...keysToDelete);
    }
  } catch (err) {
    logger.warn('Cache invalidation failed', { prefix, error: err.message });
  }
}

module.exports = { getCache, setCache, invalidateByPrefix };
