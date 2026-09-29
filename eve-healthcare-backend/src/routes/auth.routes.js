const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/signup',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('email').isEmail().withMessage('a valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
  ],
  validate,
  authController.signup
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('a valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('password is required'),
  ],
  validate,
  authController.login
);

module.exports = router;
