const express = require('express');
const { getMarketNews, getStockNews, searchNews } = require('../services/newsService');
const router = express.Router();

router.get('/market', async (req, res) => {
  try {
    const { category = 'general' } = req.query;
    const news = await getMarketNews(category);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stock/:symbol', async (req, res) => {
  try {
    const news = await getStockNews(req.params.symbol);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { query = '', category = 'india', limit = 12 } = req.query;
    if (!String(query).trim()) return res.json([]);

    const news = await searchNews(String(query), String(category), Number(limit) || 12);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
