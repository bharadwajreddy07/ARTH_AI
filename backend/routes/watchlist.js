const express = require('express');
const Watchlist = require('../models/Watchlist');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    let watchlist = await Watchlist.findOne({ user: req.user._id });
    if (!watchlist) {
      watchlist = new Watchlist({ user: req.user._id, items: [] });
      await watchlist.save();
    }
    res.json(watchlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/add', auth, async (req, res) => {
  try {
    const { symbol, name, type, alertPrice, notes } = req.body;
    let watchlist = await Watchlist.findOne({ user: req.user._id });
    if (!watchlist) watchlist = new Watchlist({ user: req.user._id, items: [] });

    const exists = watchlist.items.find(i => i.symbol === symbol);
    if (exists) return res.status(400).json({ error: 'Already in watchlist' });

    watchlist.items.push({ symbol, name, type: type || 'stock', alertPrice, notes });
    watchlist.updatedAt = new Date();
    await watchlist.save();
    res.json(watchlist);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/remove/:symbol', auth, async (req, res) => {
  try {
    const watchlist = await Watchlist.findOne({ user: req.user._id });
    if (!watchlist) return res.status(404).json({ error: 'Not found' });
    watchlist.items = watchlist.items.filter(i => i.symbol !== req.params.symbol);
    watchlist.updatedAt = new Date();
    await watchlist.save();
    res.json(watchlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
