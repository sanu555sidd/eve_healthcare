const logger = require('../config/logger');
const ApiError = require('../utils/apiError');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    logger.warn('Handled API error', {
      requestId: req.id,
      statusCode: err.statusCode,
      message: err.message,
      path: req.originalUrl,
    });
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  logger.error('Unhandled error', {
    requestId: req.id,
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
  });
  return res.status(500).json({ error: 'Internal server error' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

module.exports = { errorHandler, notFoundHandler };
