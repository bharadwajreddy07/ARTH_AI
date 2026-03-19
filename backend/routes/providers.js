const express = require('express');
const { getAIStatus } = require('../services/aiService');
const { getMarketProviderStatus } = require('../services/stockService');
const { getNewsProviderStatus } = require('../services/newsService');

const router = express.Router();

const collectConfiguredFlags = (value, acc = []) => {
  if (!value || typeof value !== 'object') return acc;

  if (Object.prototype.hasOwnProperty.call(value, 'configured')) {
    acc.push(Boolean(value.configured));
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      collectConfiguredFlags(child, acc);
    }
  }

  return acc;
};

router.get('/status', (req, res) => {
  try {
    const ai = getAIStatus();
    const market = getMarketProviderStatus();
    const news = getNewsProviderStatus();

    const allFlags = [
      ...collectConfiguredFlags(ai),
      ...collectConfiguredFlags(market),
      ...collectConfiguredFlags(news)
    ];

    const configured = allFlags.filter(Boolean).length;
    const total = allFlags.length;

    res.json({
      timestamp: new Date().toISOString(),
      readiness: {
        configured,
        total,
        ratio: total ? Number((configured / total).toFixed(2)) : 1
      },
      providers: {
        ai,
        market,
        news
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
