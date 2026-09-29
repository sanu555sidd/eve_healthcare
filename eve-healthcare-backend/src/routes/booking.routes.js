const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const bookingController = require('../controllers/booking.controller');

const router = express.Router();

// Every booking route requires an authenticated user.
router.use(authenticate);

router.post(
  '/',
  [
    body('testId').isInt().withMessage('testId must be an integer'),
    body('appointmentTime').isISO8601().withMessage('appointmentTime must be a valid ISO8601 date'),
  ],
  validate,
  bookingController.createBooking
);

router.get('/', bookingController.listMyBookings);

router.get('/:id', [param('id').isInt().withMessage('id must be an integer')], validate, bookingController.getBooking);

router.patch(
  '/:id/cancel',
  [param('id').isInt().withMessage('id must be an integer')],
  validate,
  bookingController.cancelBooking
);

module.exports = router;
