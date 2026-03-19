const { InferenceClient } = require('@huggingface/inference');

const FINBERT_MODEL = process.env.FINBERT_MODEL || 'ProsusAI/finbert';

let hfClient = null;
let cachedHfApiKey = '';
let lastSentimentError = null;

const getHfApiKey = () => {
  const direct = String(process.env.HF_API_KEY || '').trim();
  const hfToken = String(process.env.HF_TOKEN || '').trim();
  const legacy = String(process.env.HUGGINGFACE_API_KEY || '').trim();
  return direct || hfToken || legacy || '';
};

const getHfKeySource = () => {
  if (String(process.env.HF_API_KEY || '').trim()) return 'HF_API_KEY';
  if (String(process.env.HF_TOKEN || '').trim()) return 'HF_TOKEN';
  if (String(process.env.HUGGINGFACE_API_KEY || '').trim()) return 'HUGGINGFACE_API_KEY';
  return null;
};

const getHfClient = () => {
  const apiKey = getHfApiKey();
  if (!apiKey) return null;

  if (!hfClient || cachedHfApiKey !== apiKey) {
    hfClient = new InferenceClient(apiKey);
    cachedHfApiKey = apiKey;
  }

  return hfClient;
};

const toLabel = (rawLabel = '') => {
  const label = String(rawLabel).toLowerCase();
  if (label.includes('positive') || label === 'label_2') return 'positive';
  if (label.includes('negative') || label === 'label_0') return 'negative';
  return 'neutral';
};

const ruleBasedSentiment = (text) => {
  const bullishWords = [
    'surge', 'gain', 'rise', 'profit', 'growth', 'strong', 'beat', 'record',
    'high', 'rally', 'bull', 'positive', 'up', 'increase', 'outperform'
  ];
  const bearishWords = [
    'fall', 'drop', 'decline', 'loss', 'weak', 'miss', 'low', 'bear',
    'negative', 'down', 'decrease', 'concern', 'risk', 'sell', 'crash'
  ];

  const normalized = String(text || '').toLowerCase();
  const bullishHits = bullishWords.filter((word) => normalized.includes(word)).length;
  const bearishHits = bearishWords.filter((word) => normalized.includes(word)).length;

  if (bullishHits > bearishHits) {
    return { label: 'positive', score: Math.min(0.5 + bullishHits * 0.1, 0.99) };
  }

  if (bearishHits > bullishHits) {
    return { label: 'negative', score: Math.min(0.5 + bearishHits * 0.1, 0.99) };
  }

  return { label: 'neutral', score: 0.5 };
};

const analyzeSentiment = async (text) => {
  if (!text || !String(text).trim()) {
    return { label: 'neutral', score: 0.5, provider: 'fallback' };
  }

  const client = getHfClient();
  if (!client) {
    const fallback = ruleBasedSentiment(text);
    return {
      ...fallback,
      provider: 'rule-based',
      model: 'fallback-lexicon'
    };
  }

  try {
    const output = await client.textClassification({
      model: FINBERT_MODEL,
      inputs: String(text).slice(0, 2500)
    });

    const sorted = Array.isArray(output) ? [...output].sort((a, b) => b.score - a.score) : [];
    const top = sorted[0];

    if (!top) {
      throw new Error('No sentiment output from model');
    }

    return {
      label: toLabel(top.label),
      score: Number((top.score || 0).toFixed(4)),
      rawLabel: top.label,
      provider: 'finbert',
      model: FINBERT_MODEL
    };
  } catch (err) {
    lastSentimentError = err.message;

    const fallback = ruleBasedSentiment(text);
    return {
      ...fallback,
      provider: 'rule-based',
      model: 'fallback-lexicon',
      fallbackReason: err.message
    };
  }
};

const getSentimentProviderStatus = () => ({
  configured: Boolean(getHfApiKey()),
  provider: getHfApiKey() ? 'huggingface' : 'rule-based',
  model: getHfApiKey() ? FINBERT_MODEL : 'fallback-lexicon',
  keySource: getHfKeySource(),
  lastError: lastSentimentError
});

module.exports = {
  analyzeSentiment,
  getSentimentProviderStatus
};
