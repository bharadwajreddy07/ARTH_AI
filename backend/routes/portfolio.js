const express = require('express');
const Portfolio = require('../models/Portfolio');
const { getStockQuote, getHistoricalData } = require('../services/stockService');
const auth = require('../middleware/auth');
const { ingestPortfolio } = require('../services/pythonRagClient');
const router = express.Router();

/**
 * Sync a portfolio snapshot to the ChromaDB portfolio_data collection.
 * Fires-and-forgets so it never blocks the HTTP response.
 */
const syncPortfolioToChroma = (userId, portfolio) => {
  const uid = String(userId || '');
  if (!uid) return;
  const payload = {
    holdings: (portfolio.holdings || []).map((h) => ({
      symbol: h.symbol,
      name: h.name,
      type: h.type,
      quantity: h.quantity,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice: h.currentPrice || h.avgBuyPrice,
      purchaseDate: h.purchaseDate ? new Date(h.purchaseDate).toISOString() : '',
    })),
    totalInvested: portfolio.totalInvested || 0,
    currentValue: portfolio.currentValue || 0,
  };
  ingestPortfolio(uid, payload).catch((err) =>
    console.warn(`[ChromaDB] Failed to sync portfolio for ${uid}: ${err.message}`)
  );
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildSyntheticHistory = (totalInvested, currentValue, days = 90) => {
  const safeInvested = toNumber(totalInvested);
  const safeCurrent = toNumber(currentValue, safeInvested);
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const progress = (days - i) / days;
    const base = safeInvested + (safeCurrent - safeInvested) * progress;
    const wave = Math.sin(progress * Math.PI * 3) * safeCurrent * 0.01;
    const value = Math.max(0, base + wave);

    result.push({
      date: date.toISOString().split('T')[0],
      invested: safeInvested,
      value: Number(value.toFixed(2)),
      pnl: Number((value - safeInvested).toFixed(2))
    });
  }

  return result;
};

const buildPortfolioHistory = async (holdings, days = 90) => {
  const dated = new Map();

  const stockHoldings = holdings.filter((h) => String(h.type) === 'stock' && h.symbol);
  const settled = await Promise.allSettled(stockHoldings.map(async (holding) => {
    const history = await getHistoricalData(holding.symbol, '3mo', '1d');
    return {
      holding,
      history: Array.isArray(history) ? history.slice(-days) : []
    };
  }));

  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue;

    const { holding, history } = entry.value;
    for (const point of history) {
      const key = point.date;
      if (!key) continue;
      const previous = dated.get(key) || 0;
      dated.set(key, previous + toNumber(point.close) * toNumber(holding.quantity));
    }
  }

  const dates = Array.from(dated.keys()).sort();
  if (!dates.length) {
    const totalInvested = holdings.reduce((sum, h) => sum + toNumber(h.quantity) * toNumber(h.avgBuyPrice), 0);
    const currentValue = holdings.reduce((sum, h) => sum + toNumber(h.quantity) * toNumber(h.currentPrice || h.avgBuyPrice), 0);
    return buildSyntheticHistory(totalInvested, currentValue, days);
  }

  const totalInvested = holdings.reduce((sum, h) => sum + toNumber(h.quantity) * toNumber(h.avgBuyPrice), 0);

  return dates.map((date) => {
    const value = toNumber(dated.get(date));
    return {
      date,
      invested: Number(totalInvested.toFixed(2)),
      value: Number(value.toFixed(2)),
      pnl: Number((value - totalInvested).toFixed(2))
    };
  });
};

// Get portfolio
router.get('/', auth, async (req, res) => {
  try {
    let portfolio = await Portfolio.findOne({ user: req.user._id });
    if (!portfolio) {
      portfolio = new Portfolio({ user: req.user._id, holdings: [] });
      await portfolio.save();
    }

    // Refresh current prices
    const updatedHoldings = await Promise.all(
      portfolio.holdings.map(async (h) => {
        try {
          const quote = await getStockQuote(h.symbol);
          h.currentPrice = quote.price;
        } catch (e) {}
        return h;
      })
    );

    portfolio.holdings = updatedHoldings;
    portfolio.currentValue = updatedHoldings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
    portfolio.totalInvested = updatedHoldings.reduce((sum, h) => sum + h.quantity * h.avgBuyPrice, 0);
    portfolio.updatedAt = new Date();
    await portfolio.save();

    // Async: index the refreshed portfolio in ChromaDB
    syncPortfolioToChroma(req.user._id, portfolio);

    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add holding
router.post('/holding', auth, async (req, res) => {
  try {
    const { symbol, name, type, quantity, avgBuyPrice, purchaseDate } = req.body;
    let portfolio = await Portfolio.findOne({ user: req.user._id });
    if (!portfolio) portfolio = new Portfolio({ user: req.user._id, holdings: [] });

    // Check if already exists
    const existing = portfolio.holdings.find(h => h.symbol === symbol);
    if (existing) {
      // Average down/up
      const totalQty = existing.quantity + quantity;
      existing.avgBuyPrice = ((existing.avgBuyPrice * existing.quantity) + (avgBuyPrice * quantity)) / totalQty;
      existing.quantity = totalQty;
    } else {
      portfolio.holdings.push({ symbol, name, type, quantity, avgBuyPrice, purchaseDate });
    }

    await portfolio.save();

    // Async: update ChromaDB with the new holding
    syncPortfolioToChroma(req.user._id, portfolio);

    res.json(portfolio);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove holding
router.delete('/holding/:symbol', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ user: req.user._id });
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    portfolio.holdings = portfolio.holdings.filter((h) => h.symbol !== req.params.symbol);
    await portfolio.save();

    // Async: update ChromaDB after removing the holding
    syncPortfolioToChroma(req.user._id, portfolio);

    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Portfolio analytics for charts
router.get('/analytics', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ user: req.user._id });
    if (!portfolio) {
      return res.json({
        history: [],
        byHolding: [],
        byType: [],
        totals: {
          invested: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercent: 0
        }
      });
    }

    const refreshedHoldings = await Promise.all(portfolio.holdings.map(async (holding) => {
      const copy = { ...holding.toObject() };
      if (copy.type === 'stock' && copy.symbol) {
        try {
          const quote = await getStockQuote(copy.symbol);
          copy.currentPrice = quote.price;
        } catch (err) {
          // Keep existing current price.
        }
      }
      return copy;
    }));

    const totals = refreshedHoldings.reduce((acc, holding) => {
      const invested = toNumber(holding.quantity) * toNumber(holding.avgBuyPrice);
      const current = toNumber(holding.quantity) * toNumber(holding.currentPrice || holding.avgBuyPrice);
      acc.invested += invested;
      acc.currentValue += current;
      return acc;
    }, { invested: 0, currentValue: 0 });

    const pnl = totals.currentValue - totals.invested;
    const pnlPercent = totals.invested ? (pnl / totals.invested) * 100 : 0;

    const history = await buildPortfolioHistory(refreshedHoldings, 90);

    const byHolding = refreshedHoldings.map((holding) => {
      const invested = toNumber(holding.quantity) * toNumber(holding.avgBuyPrice);
      const currentValue = toNumber(holding.quantity) * toNumber(holding.currentPrice || holding.avgBuyPrice);
      const valuePnl = currentValue - invested;
      return {
        symbol: holding.symbol,
        name: holding.name,
        type: holding.type,
        invested: Number(invested.toFixed(2)),
        currentValue: Number(currentValue.toFixed(2)),
        pnl: Number(valuePnl.toFixed(2)),
        pnlPercent: invested ? Number(((valuePnl / invested) * 100).toFixed(2)) : 0
      };
    });

    const byTypeMap = new Map();
    for (const item of byHolding) {
      const key = item.type || 'other';
      const previous = byTypeMap.get(key) || { type: key, invested: 0, currentValue: 0, pnl: 0 };
      previous.invested += item.invested;
      previous.currentValue += item.currentValue;
      previous.pnl += item.pnl;
      byTypeMap.set(key, previous);
    }

    const byType = Array.from(byTypeMap.values()).map((item) => ({
      ...item,
      invested: Number(item.invested.toFixed(2)),
      currentValue: Number(item.currentValue.toFixed(2)),
      pnl: Number(item.pnl.toFixed(2))
    }));

    res.json({
      history,
      byHolding,
      byType,
      totals: {
        invested: Number(totals.invested.toFixed(2)),
        currentValue: Number(totals.currentValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
