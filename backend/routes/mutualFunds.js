const express = require('express');
const { getMFDetails, searchMutualFunds, getTopMFs, getMFComparison } = require('../services/mfService');
const router = express.Router();

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await searchMutualFunds(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/popular', async (req, res) => {
  try {
    const data = await getTopMFs();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:schemeCode', async (req, res) => {
  try {
    const data = await getMFDetails(req.params.schemeCode);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/compare', async (req, res) => {
  try {
    const { codes } = req.body;
    if (!codes || !Array.isArray(codes)) return res.status(400).json({ error: 'codes array required' });
    const data = await getMFComparison(codes);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
