const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const centreController = require('../controllers/centre.controller');

const router = express.Router();

router.get('/', centreController.listCentres);

router.get('/:id', [param('id').isInt().withMessage('id must be an integer')], validate, centreController.getCentre);

router.post(
  '/',
  authenticate,
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('location').trim().notEmpty().withMessage('location is required'),
  ],
  validate,
  centreController.createCentre
);

router.get(
  '/:id/tests',
  [param('id').isInt().withMessage('id must be an integer')],
  validate,
  centreController.listTestsForCentre
);

router.post(
  '/:id/tests',
  authenticate,
  [
    param('id').isInt().withMessage('id must be an integer'),
    body('name').trim().notEmpty().withMessage('name is required'),
    body('price').isFloat({ min: 0 }).withMessage('price must be a non-negative number'),
  ],
  validate,
  centreController.createTestForCentre
);

module.exports = router;
