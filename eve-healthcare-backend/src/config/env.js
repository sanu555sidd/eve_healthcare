require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/eve_healthcare',
  jwtSecret: process.env.JWT_SECRET || 'change_this_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Probability (0-1) that a simulated payment fails.
  paymentFailureRate: Number(process.env.PAYMENT_FAILURE_RATE || 0.2),
  // Probability (0-1) that webhook processing hits a simulated transient error,
  // used to exercise the retry pipeline.
  webhookFailureSimulationRate: Number(process.env.WEBHOOK_FAILURE_SIMULATION_RATE || 0.15),
};
