const express = require('express');
const {
  getStockQuote,
  getDualExchangeQuotes,
  getHistoricalData,
  getStockDeepDetails,
  searchStocks,
  getTopGainers,
  getTopLosers,
  getPopularStocks,
  getFOInstruments,
  getIndianBonds,
  getUpcomingIPOs,
  indianStocksDB
} = require('../services/stockService');
const router = express.Router();

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await searchStocks(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quote/:symbol', async (req, res) => {
  try {
    const quote = await getStockQuote(req.params.symbol);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quote-both/:symbol', async (req, res) => {
  try {
    const data = await getDualExchangeQuotes(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/deep/:symbol', async (req, res) => {
  try {
    const data = await getStockDeepDetails(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:symbol', async (req, res) => {
  try {
    const { period = '1y', interval = '1d' } = req.query;
    const data = await getHistoricalData(req.params.symbol, period, interval);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gainers', async (req, res) => {
  try {
    const data = await getTopGainers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/losers', async (req, res) => {
  try {
    const data = await getTopLosers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/indices', async (req, res) => {
  try {
    const indices = await Promise.all([
      getStockQuote('^NSEI'),    // Nifty 50
      getStockQuote('^BSESN'),   // Sensex
      getStockQuote('^NSEBANK')  // Bank Nifty
    ]);
    res.json(indices);
  } catch (err) {
    // Mock indices
    res.json([
      { symbol: '^NSEI', name: 'Nifty 50', price: 22350.45, change: 125.30, changePercent: 0.56 },
      { symbol: '^BSESN', name: 'Sensex', price: 73845.20, change: 389.15, changePercent: 0.53 },
      { symbol: '^NSEBANK', name: 'Bank Nifty', price: 47832.60, change: -145.80, changePercent: -0.30 }
    ]);
  }
});

router.get('/popular', async (req, res) => {
  try {
    const data = await getPopularStocks();
    res.json(data);
  } catch (err) {
    res.json(indianStocksDB.slice(0, 20));
  }
});

router.get('/fno', async (req, res) => {
  try {
    const data = await getFOInstruments();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bonds', async (req, res) => {
  try {
    const data = await getIndianBonds();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ipos', async (req, res) => {
  try {
    const data = await getUpcomingIPOs();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
