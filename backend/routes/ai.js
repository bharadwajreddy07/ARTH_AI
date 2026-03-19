const express = require('express');
const { chat, analyzeStock, analyzeMutualFund, compareAssets, getForecast, getAIStatus, runAIDiagnostics } = require('../services/aiService');
const { ingestRagDocuments, listRagDocuments, clearRagDocuments, getRagStatus } = require('../services/ragService');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Stricter rate limit for AI endpoints
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

router.get('/status', (req, res) => {
  res.json(getAIStatus());
});

router.get('/rag/status', (req, res) => {
  res.json(getRagStatus());
});

router.get('/rag/documents', (req, res) => {
  const limit = Number(req.query.limit) || 25;
  res.json({
    documents: listRagDocuments(limit)
  });
});

router.post('/rag/ingest', aiLimiter, async (req, res) => {
  try {
    const { documents, replace = false, source = 'api' } = req.body || {};
    if (!Array.isArray(documents) || !documents.length) {
      return res.status(400).json({ error: 'documents array is required' });
    }

    const result = await ingestRagDocuments(documents, { replace, source });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rag/documents', aiLimiter, async (req, res) => {
  try {
    const result = await clearRagDocuments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diagnostics', aiLimiter, async (req, res) => {
  try {
    const diagnostics = await runAIDiagnostics();
    res.json(diagnostics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat', aiLimiter, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const response = await chat(message, context || {});
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analyze/:symbol', aiLimiter, async (req, res) => {
  try {
    const result = await analyzeStock(req.params.symbol);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analyze-realtime/:symbol', aiLimiter, async (req, res) => {
  try {
    const result = await analyzeStock(req.params.symbol);
    res.json({ ...result, realtime: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analyze-mf/:schemeCode', aiLimiter, async (req, res) => {
  try {
    const result = await analyzeMutualFund(req.params.schemeCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/compare', aiLimiter, async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!symbols || symbols.length < 2) return res.status(400).json({ error: 'At least 2 symbols required' });
    const result = await compareAssets(symbols);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forecast', aiLimiter, async (req, res) => {
  try {
    const { symbol, scenario } = req.body;
    if (!symbol || !scenario) return res.status(400).json({ error: 'symbol and scenario required' });
    const result = await getForecast(symbol, scenario);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
