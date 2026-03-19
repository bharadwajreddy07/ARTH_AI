const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

const generateToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET || 'arth_secret',
  { expiresIn: process.env.JWT_EXPIRE || '7d' }
);

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const user = new User({ name, email, password });
    await user.save();

    res.status(201).json({
      user,
      token: generateToken(user._id),
      message: 'Welcome to Arth!'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ user, token: generateToken(user._id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = ['name', 'investmentGoals'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) req.user[field] = req.body[field];
    });
    await req.user.save();
    res.json({ user: req.user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
