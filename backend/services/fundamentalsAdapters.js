const axios = require('axios');

const REQUEST_TIMEOUT = 10000;

const FUNDAMENTAL_KEYS = [
  'marketCap',
  'pe',
  'eps',
  'pb',
  'roe',
  'roa',
  'dividendYield',
  'bookValue',
  'debtToEquity',
  'profitMargins',
  'operatingMargins',
  'sector',
  'industry'
];

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPercent = (value) => {
  const numeric = toNumber(value, null);
  if (!Number.isFinite(numeric)) return null;
  return numeric <= 1 ? Number((numeric * 100).toFixed(2)) : Number(numeric.toFixed(2));
};

const compactText = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const normalizeBaseSymbol = (symbol = '') => String(symbol)
  .trim()
  .toUpperCase()
  .replace(/\.(NS|BO|NSE|BSE)$/i, '');

const buildIndiaCandidates = (symbol = '') => {
  const raw = String(symbol || '').trim().toUpperCase();
  const base = normalizeBaseSymbol(raw);

  const candidates = [
    raw,
    `${base}.NS`,
    `${base}.BO`,
    `${base}.NSE`,
    `${base}.BSE`,
    base
  ].filter(Boolean);

  return Array.from(new Set(candidates));
};

const hasAnyFundamentalValue = (data = {}) => {
  return FUNDAMENTAL_KEYS.some((key) => {
    const value = data[key];
    if (typeof value === 'number') return Number.isFinite(value);
    return Boolean(String(value || '').trim());
  });
};

const scoreCoverage = (data = {}) => {
  return FUNDAMENTAL_KEYS.reduce((count, key) => {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) return count + 1;
    if (typeof value === 'string' && value.trim()) return count + 1;
    return count;
  }, 0);
};

const getAlphaVantageApiKey = () => String(process.env.ALPHA_VANTAGE_API_KEY || '').trim();
const getFmpApiKey = () => String(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || '').trim();
const getPolygonApiKey = () => String(process.env.POLYGON_API_KEY || '').trim();

const getAlphaVantageKeySource = () => (String(process.env.ALPHA_VANTAGE_API_KEY || '').trim() ? 'ALPHA_VANTAGE_API_KEY' : null);
const getFmpKeySource = () => {
  if (String(process.env.FMP_API_KEY || '').trim()) return 'FMP_API_KEY';
  if (String(process.env.FINANCIAL_MODELING_PREP_API_KEY || '').trim()) return 'FINANCIAL_MODELING_PREP_API_KEY';
  return null;
};
const getPolygonKeySource = () => (String(process.env.POLYGON_API_KEY || '').trim() ? 'POLYGON_API_KEY' : null);

const fetchAlphaVantageFundamentals = async (symbol) => {
  const apiKey = getAlphaVantageApiKey();
  if (!apiKey) {
    return {
      provider: 'alpha-vantage',
      configured: false,
      ok: false,
      error: 'API key missing',
      data: {}
    };
  }

  const candidates = buildIndiaCandidates(symbol);
  let lastError = 'No Alpha Vantage fundamentals found';

  for (const candidate of candidates) {
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        timeout: REQUEST_TIMEOUT,
        params: {
          function: 'OVERVIEW',
          symbol: candidate,
          apikey: apiKey
        }
      });

      const payload = response.data || {};
      if (payload.Note) {
        lastError = payload.Note;
        continue;
      }
      if (payload.Information) {
        lastError = payload.Information;
        continue;
      }
      if (payload['Error Message']) {
        lastError = payload['Error Message'];
        continue;
      }

      const data = {
        marketCap: toNumber(payload.MarketCapitalization),
        pe: toNumber(payload.PERatio),
        eps: toNumber(payload.EPS),
        pb: toNumber(payload.PriceToBookRatio),
        roe: toPercent(payload.ReturnOnEquityTTM),
        roa: toPercent(payload.ReturnOnAssetsTTM),
        dividendYield: toPercent(payload.DividendYield),
        bookValue: toNumber(payload.BookValue),
        debtToEquity: toNumber(payload.DebtToEquity),
        profitMargins: toPercent(payload.ProfitMargin),
        operatingMargins: toPercent(payload.OperatingMarginTTM),
        sector: compactText(payload.Sector),
        industry: compactText(payload.Industry)
      };

      if (!hasAnyFundamentalValue(data)) {
        lastError = 'Alpha Vantage returned empty fundamentals';
        continue;
      }

      return {
        provider: 'alpha-vantage',
        configured: true,
        ok: true,
        symbol: candidate,
        coverage: scoreCoverage(data),
        data
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    provider: 'alpha-vantage',
    configured: true,
    ok: false,
    error: lastError,
    data: {}
  };
};

const fetchFmpFundamentals = async (symbol) => {
  const apiKey = getFmpApiKey();
  if (!apiKey) {
    return {
      provider: 'financial-modeling-prep',
      configured: false,
      ok: false,
      error: 'API key missing',
      data: {}
    };
  }

  const candidates = buildIndiaCandidates(symbol);
  let lastError = 'No FMP fundamentals found';

  for (const candidate of candidates) {
    try {
      const [profileRes, ratioRes] = await Promise.all([
        axios.get(`https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(candidate)}`, {
          timeout: REQUEST_TIMEOUT,
          params: { apikey: apiKey }
        }),
        axios.get(`https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(candidate)}`, {
          timeout: REQUEST_TIMEOUT,
          params: { apikey: apiKey }
        })
      ]);

      const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;
      const ratio = Array.isArray(ratioRes.data) ? ratioRes.data[0] : null;

      if (!profile && !ratio) {
        lastError = 'FMP returned no profile or ratio data';
        continue;
      }

      const data = {
        marketCap: toNumber(profile?.mktCap),
        pe: toNumber(ratio?.priceEarningsRatioTTM || profile?.pe),
        eps: toNumber(profile?.eps),
        pb: toNumber(ratio?.priceToBookRatioTTM),
        roe: toPercent(ratio?.returnOnEquityTTM),
        roa: toPercent(ratio?.returnOnAssetsTTM),
        dividendYield: toPercent(ratio?.dividendYieldTTM),
        bookValue: toNumber(profile?.bookValuePerShare),
        debtToEquity: toNumber(ratio?.debtEquityRatioTTM),
        profitMargins: toPercent(ratio?.netProfitMarginTTM),
        operatingMargins: toPercent(ratio?.operatingProfitMarginTTM),
        sector: compactText(profile?.sector),
        industry: compactText(profile?.industry)
      };

      if (!hasAnyFundamentalValue(data)) {
        lastError = 'FMP returned empty fundamentals';
        continue;
      }

      return {
        provider: 'financial-modeling-prep',
        configured: true,
        ok: true,
        symbol: candidate,
        coverage: scoreCoverage(data),
        data
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    provider: 'financial-modeling-prep',
    configured: true,
    ok: false,
    error: lastError,
    data: {}
  };
};

const fetchPolygonFundamentals = async (symbol) => {
  const apiKey = getPolygonApiKey();
  if (!apiKey) {
    return {
      provider: 'polygon',
      configured: false,
      ok: false,
      error: 'API key missing',
      data: {}
    };
  }

  const candidates = buildIndiaCandidates(symbol);
  let lastError = 'No Polygon fundamentals found';

  for (const candidate of candidates) {
    try {
      const [tickerRes, financialRes] = await Promise.all([
        axios.get(`https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(candidate)}`, {
          timeout: REQUEST_TIMEOUT,
          params: { apiKey }
        }),
        axios.get('https://api.polygon.io/vX/reference/financials', {
          timeout: REQUEST_TIMEOUT,
          params: {
            ticker: candidate,
            limit: 1,
            apiKey
          }
        })
      ]);

      const ticker = tickerRes.data?.results || {};
      const financial = Array.isArray(financialRes.data?.results) ? financialRes.data.results[0] : null;
      const income = financial?.financials?.income_statement || {};
      const balance = financial?.financials?.balance_sheet || {};

      const data = {
        marketCap: toNumber(ticker.market_cap),
        pe: null,
        eps: toNumber(income.basic_earnings_per_share?.value),
        pb: null,
        roe: null,
        roa: null,
        dividendYield: null,
        bookValue: toNumber(balance.book_value_per_share?.value),
        debtToEquity: toNumber(balance.debt_to_equity_ratio?.value),
        profitMargins: toPercent(income.net_income_loss_ratio?.value),
        operatingMargins: toPercent(income.operating_income_loss_ratio?.value),
        sector: compactText(ticker.sic_description),
        industry: compactText(ticker.primary_exchange)
      };

      if (!hasAnyFundamentalValue(data)) {
        lastError = 'Polygon returned empty fundamentals';
        continue;
      }

      return {
        provider: 'polygon',
        configured: true,
        ok: true,
        symbol: candidate,
        coverage: scoreCoverage(data),
        data
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    provider: 'polygon',
    configured: true,
    ok: false,
    error: lastError,
    data: {}
  };
};

const fetchFundamentalsWithFallback = async (symbol) => {
  const providers = [
    fetchAlphaVantageFundamentals,
    fetchFmpFundamentals,
    fetchPolygonFundamentals
  ];

  const results = [];
  for (const fetcher of providers) {
    const result = await fetcher(symbol);
    results.push(result);
  }

  const successful = results
    .filter((result) => result.ok && hasAnyFundamentalValue(result.data))
    .sort((a, b) => (b.coverage || 0) - (a.coverage || 0));

  const winner = successful[0] || null;

  return {
    providerUsed: winner?.provider || null,
    data: winner?.data || {},
    coverage: winner?.coverage || 0,
    providerResults: results
  };
};

const getFundamentalsProviderStatus = () => {
  return {
    alphaVantage: {
      configured: Boolean(getAlphaVantageApiKey()),
      keySource: getAlphaVantageKeySource()
    },
    financialModelingPrep: {
      configured: Boolean(getFmpApiKey()),
      keySource: getFmpKeySource()
    },
    polygon: {
      configured: Boolean(getPolygonApiKey()),
      keySource: getPolygonKeySource()
    }
  };
};

module.exports = {
  fetchFundamentalsWithFallback,
  getFundamentalsProviderStatus
};
