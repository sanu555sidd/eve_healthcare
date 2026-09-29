const { Pool } = require('pg');
const { databaseUrl } = require('../src/config/env');
const logger = require('../src/config/logger');

const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

module.exports = pool;
