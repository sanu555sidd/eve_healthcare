const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/payment.service');
const webhookService = require('../services/webhook.service');

const pay = asyncHandler(async (req, res) => {
  const result = await paymentService.simulatePayment(req.user.id, req.body);
  res.status(200).json(result);
});

const webhook = asyncHandler(async (req, res) => {
  const result = await webhookService.receiveWebhook(req.body);

  if (result.duplicate) {
    return res.status(200).json({ message: 'Event already processed (idempotent)', eventId: req.body.eventId });
  }
  if (result.queued) {
    return res
      .status(202)
      .json({ message: 'Webhook received, processing deferred for retry', eventId: req.body.eventId });
  }
  return res.status(200).json({ message: 'Webhook processed', event: result.event });
});

module.exports = { pay, webhook };
