const pool = require('../../db');
const { getCache, setCache, invalidateByPrefix } = require('./cache.service');
const { buildPaginatedResponse } = require('../utils/pagination');
const ApiError = require('../utils/apiError');

const CACHE_PREFIX = 'centres:';

async function listCentres({ page, limit, offset }) {
  const cacheKey = `${CACHE_PREFIX}list:${page}:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      'SELECT id, name, location, created_at FROM diagnostic_centres ORDER BY id LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM diagnostic_centres'),
  ]);

  const response = buildPaginatedResponse({ rows: rowsResult.rows, total: countResult.rows[0].total, page, limit });
  await setCache(cacheKey, response);
  return response;
}

async function getCentreById(id) {
  const result = await pool.query(
    'SELECT id, name, location, created_at FROM diagnostic_centres WHERE id = $1',
    [id]
  );
  if (!result.rows[0]) throw new ApiError(404, 'Diagnostic centre not found');
  return result.rows[0];
}

async function createCentre({ name, location }) {
  const result = await pool.query(
    'INSERT INTO diagnostic_centres (name, location) VALUES ($1, $2) RETURNING id, name, location, created_at',
    [name, location]
  );
  await invalidateByPrefix(CACHE_PREFIX);
  return result.rows[0];
}

async function listTestsForCentre(centreId, { page, limit, offset }) {
  await getCentreById(centreId);

  const cacheKey = `${CACHE_PREFIX}${centreId}:tests:${page}:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      'SELECT id, centre_id, name, price, created_at FROM diagnostic_tests WHERE centre_id = $1 ORDER BY id LIMIT $2 OFFSET $3',
      [centreId, limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM diagnostic_tests WHERE centre_id = $1', [centreId]),
  ]);

  const response = buildPaginatedResponse({ rows: rowsResult.rows, total: countResult.rows[0].total, page, limit });
  await setCache(cacheKey, response);
  return response;
}

async function createTestForCentre(centreId, { name, price }) {
  await getCentreById(centreId);
  const result = await pool.query(
    'INSERT INTO diagnostic_tests (centre_id, name, price) VALUES ($1, $2, $3) RETURNING id, centre_id, name, price, created_at',
    [centreId, name, price]
  );
  await invalidateByPrefix(CACHE_PREFIX);
  return result.rows[0];
}

async function getTestById(testId) {
  const result = await pool.query(
    `SELECT t.id, t.name, t.price, t.centre_id, c.name AS centre_name, c.location AS centre_location
     FROM diagnostic_tests t
     JOIN diagnostic_centres c ON c.id = t.centre_id
     WHERE t.id = $1`,
    [testId]
  );
  if (!result.rows[0]) throw new ApiError(404, 'Diagnostic test not found');
  return result.rows[0];
}

async function listAllTests({ page, limit, offset }) {
  const cacheKey = `${CACHE_PREFIX}alltests:${page}:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT t.id, t.name, t.price, t.centre_id, c.name AS centre_name
       FROM diagnostic_tests t
       JOIN diagnostic_centres c ON c.id = t.centre_id
       ORDER BY t.id LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM diagnostic_tests'),
  ]);

  const response = buildPaginatedResponse({ rows: rowsResult.rows, total: countResult.rows[0].total, page, limit });
  await setCache(cacheKey, response);
  return response;
}

module.exports = {
  listCentres,
  getCentreById,
  createCentre,
  listTestsForCentre,
  createTestForCentre,
  getTestById,
  listAllTests,
};
