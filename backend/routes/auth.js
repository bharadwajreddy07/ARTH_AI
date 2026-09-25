const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { ingestUser } = require('../services/pythonRagClient');

const router = express.Router();

const generateToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET || 'arth_secret',
  { expiresIn: process.env.JWT_EXPIRE || '7d' }
);

/**
 * Sync a user's profile data into ChromaDB (user_profiles collection).
 * Fires-and-forgets - never blocks the auth response.
 */
const syncUserToChroma = (user) => {
  const userId = String(user._id || user.id || '');
  if (!userId) return;

  ingestUser(userId, {
    name: user.name || '',
    email: user.email || '',
    investmentGoals: user.investmentGoals || [],
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
  }).catch((err) =>
    console.warn(`[ChromaDB] Failed to sync user profile ${userId}: ${err.message}`)
  );
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const user = new User({ name, email, password });
    await user.save();

    // Async: index the new user profile in ChromaDB
    syncUserToChroma(user);

    res.status(201).json({
      user,
      token: generateToken(user._id),
      message: 'Welcome to Arth!',
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

    // Async: re-sync user profile on every login (captures goal updates)
    syncUserToChroma(user);

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
    updates.forEach((field) => {
      if (req.body[field] !== undefined) req.user[field] = req.body[field];
    });
    await req.user.save();

    // Async: update ChromaDB embedding with the new profile data
    syncUserToChroma(req.user);

    res.json({ user: req.user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
