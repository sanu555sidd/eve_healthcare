const asyncHandler = require('../utils/asyncHandler');
const bookingService = require('../services/booking.service');
const { getPagination } = require('../utils/pagination');

const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user.id, req.body);
  res.status(201).json(booking);
});

const listMyBookings = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await bookingService.listUserBookings(req.user.id, pagination);
  res.json(result);
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.getOwnedBooking(req.params.id, req.user.id);
  res.json(booking);
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(req.params.id, req.user.id);
  res.json(booking);
});

module.exports = { createBooking, listMyBookings, getBooking, cancelBooking };
