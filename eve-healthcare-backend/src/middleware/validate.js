const { validationResult } = require('express-validator');
const ApiError = require('../utils/apiError');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  return next();
}

module.exports = validate;
