const express = require('express');
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const centreController = require('../controllers/centre.controller');

const router = express.Router();

router.get('/', centreController.listAllTests);
router.get('/:id', [param('id').isInt().withMessage('id must be an integer')], validate, centreController.getTest);

module.exports = router;
