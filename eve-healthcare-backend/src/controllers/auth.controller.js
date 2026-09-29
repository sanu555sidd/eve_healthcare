const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');

const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { user, token } = await authService.signup({ name, email, password });
  res.status(201).json({ user, token });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await authService.login({ email, password });
  res.status(200).json({ user, token });
});

module.exports = { signup, login };
