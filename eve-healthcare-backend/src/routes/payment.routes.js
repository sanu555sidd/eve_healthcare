const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

router.post(
  '/',
  authenticate,
  paymentLimiter,
  [body('bookingId').isInt().withMessage('bookingId must be an integer')],
  validate,
  paymentController.pay
);

// Webhooks come from the (simulated) payment provider, not a logged-in user,
// so this route intentionally has no `authenticate` middleware.
router.post(
  '/webhook',
  paymentLimiter,
  [
    body('eventId').notEmpty().withMessage('eventId is required'),
    body('bookingId').isInt().withMessage('bookingId must be an integer'),
    body('status').isIn(['SUCCESS', 'FAILED']).withMessage('status must be SUCCESS or FAILED'),
  ],
  validate,
  paymentController.webhook
);

module.exports = router;
