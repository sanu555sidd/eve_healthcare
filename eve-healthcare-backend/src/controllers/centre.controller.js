const asyncHandler = require('../utils/asyncHandler');
const centreService = require('../services/centre.service');
const { getPagination } = require('../utils/pagination');

const listCentres = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await centreService.listCentres(pagination);
  res.json(result);
});

const getCentre = asyncHandler(async (req, res) => {
  const centre = await centreService.getCentreById(req.params.id);
  res.json(centre);
});

const createCentre = asyncHandler(async (req, res) => {
  const centre = await centreService.createCentre(req.body);
  res.status(201).json(centre);
});

const listTestsForCentre = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await centreService.listTestsForCentre(req.params.id, pagination);
  res.json(result);
});

const createTestForCentre = asyncHandler(async (req, res) => {
  const test = await centreService.createTestForCentre(req.params.id, req.body);
  res.status(201).json(test);
});

const listAllTests = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await centreService.listAllTests(pagination);
  res.json(result);
});

const getTest = asyncHandler(async (req, res) => {
  const test = await centreService.getTestById(req.params.id);
  res.json(test);
});

module.exports = {
  listCentres,
  getCentre,
  createCentre,
  listTestsForCentre,
  createTestForCentre,
  listAllTests,
  getTest,
};
