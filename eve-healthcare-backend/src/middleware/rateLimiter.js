const rateLimit = require('express-rate-limit');
   const { RedisStore } = require('rate-limit-redis');
   const redisClient = require('../config/redis');

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || 'Too many requests, please try again later.' },
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rl:',
    }),
  });
}

// General API-wide limiter: generous, mainly to blunt scraping/abuse.
const generalLimiter = makeLimiter({ windowMs: 60 * 1000, max: 100 });

// Tighter limiter on auth endpoints to slow down credential stuffing / brute force.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
});

// Payment & webhook endpoints get their own moderate limit.
const paymentLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many payment requests, please slow down.',
});

module.exports = { generalLimiter, authLimiter, paymentLimiter };
