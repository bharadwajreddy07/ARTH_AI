const axios = require('axios');
const { default: YahooFinance } = require('yahoo-finance2');
const cache = require('./cache');
const { fetchFundamentalsWithFallback, getFundamentalsProviderStatus } = require('./fundamentalsAdapters');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const PERIOD_TO_DAYS = {
  '1d': 1,
  '5d': 5,
  '1w': 7,
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
  '10y': 3650
};

const SUPPORTED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPercentNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const cleaned = String(value).replace(/%/g, '').replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatQuarterLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
};

const formatYearLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return String(date.getUTCFullYear());
};

const seededRandom = (seed) => {
  const numeric = Math.sin(seed) * 10000;
  return numeric - Math.floor(numeric);
};

const stableSymbolSeed = (symbol = '') => {
  return String(symbol).split('').reduce((acc, char, index) => acc + (char.charCodeAt(0) * (index + 1)), 0) || 1;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPercentValue = (value) => {
  const numeric = toNullableNumber(value);
  if (numeric === null) return null;
  return roundTo(numeric <= 1 ? numeric * 100 : numeric, 2);
};

const mergeFundamentals = (primary = {}, fallback = {}) => {
  const merged = { ...primary };

  for (const [key, value] of Object.entries(fallback || {})) {
    if (value === null || value === undefined || value === '') continue;

    const current = merged[key];
    const missing = current === null
      || current === undefined
      || (typeof current === 'number' && !Number.isFinite(current));

    if (missing) merged[key] = value;
  }

  return merged;
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const getCandidateSymbols = (symbol) => {
  if (!symbol) return [];
  const clean = String(symbol).trim();
  if (!clean) return [];

  if (clean.includes('.') || clean.startsWith('^')) {
    return [clean];
  }

  return [clean, `${clean}.NS`, `${clean}.BO`];
};

const resolveIndianBaseSymbol = (symbol) => {
  if (!symbol) return '';
  const clean = String(symbol).trim().toUpperCase();
  if (clean.endsWith('.NS') || clean.endsWith('.BO')) {
    return clean.slice(0, -3);
  }
  return clean;
};

const resolvePeriodDates = (period) => {
  const days = PERIOD_TO_DAYS[period] || PERIOD_TO_DAYS['1y'];
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - days * 24 * 60 * 60 * 1000);
  return { period1, period2 };
};

const resolveInterval = (interval) => {
  if (interval && SUPPORTED_INTERVALS.has(interval)) return interval;
  return '1d';
};

const normalizeExchangeName = (value = '', symbol = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  const symbolUpper = String(symbol || '').trim().toUpperCase();

  if (normalized.includes('BOMBAY') || normalized === 'BSE') return 'BSE';
  if (normalized.includes('NSE') || normalized.includes('NATIONAL STOCK EXCHANGE')) return 'NSE';

  if (symbolUpper.endsWith('.BO')) return 'BSE';
  if (symbolUpper.endsWith('.NS')) return 'NSE';

  return String(value || '').trim();
};

const extractRawMetric = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const sanitized = value.replace(/,/g, '').replace(/%/g, '').trim();
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  if (typeof value === 'object') {
    if (value.raw !== undefined) return extractRawMetric(value.raw, fallback);
    if (value.fmt !== undefined) return extractRawMetric(value.fmt, fallback);
    if (value.longFmt !== undefined) return extractRawMetric(value.longFmt, fallback);
  }

  return fallback;
};

const extractMetricFromKeys = (row = {}, keys = []) => {
  for (const key of keys) {
    const value = extractRawMetric(row?.[key]);
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

const roundTo = (value, digits = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(digits));
};

const average = (values = []) => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const stdDev = (values = []) => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;

  const mean = average(clean);
  const variance = clean.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / clean.length;
  return Math.sqrt(variance);
};

const computeEMAValue = (values = [], period = 20) => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < period) return null;

  const alpha = 2 / (period + 1);
  let ema = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < clean.length; i++) {
    ema = (clean[i] * alpha) + (ema * (1 - alpha));
  }

  return ema;
};

const computeEMASeries = (values = [], period = 12) => {
  const clean = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (clean.length < period) return [];

  const alpha = 2 / (period + 1);
  const result = new Array(clean.length).fill(null);
  let ema = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = ema;

  for (let i = period; i < clean.length; i++) {
    ema = (clean[i] * alpha) + (ema * (1 - alpha));
    result[i] = ema;
  }

  return result;
};

const computeRSI = (values = [], period = 14) => {
  const clean = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (clean.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = clean[i] - clean[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < clean.length; i++) {
    const change = clean[i] - clean[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const computeMACD = (values = []) => {
  const clean = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (clean.length < 35) {
    return {
      macd: null,
      signal: null,
      histogram: null
    };
  }

  const ema12 = computeEMASeries(clean, 12);
  const ema26 = computeEMASeries(clean, 26);
  const macdSeries = clean.map((_, index) => {
    if (ema12[index] === null || ema26[index] === null) return null;
    return ema12[index] - ema26[index];
  });

  const validMacd = macdSeries.filter((value) => value !== null);
  const signalSeries = computeEMASeries(validMacd, 9);
  const macd = validMacd.length ? validMacd[validMacd.length - 1] : null;
  const signal = signalSeries.length ? signalSeries[signalSeries.length - 1] : null;
  const histogram = macd !== null && signal !== null ? macd - signal : null;

  return {
    macd,
    signal,
    histogram
  };
};

const computeATR = (history = [], period = 14) => {
  const rows = Array.isArray(history) ? history : [];
  if (rows.length < period + 1) return null;

  const trueRanges = [];

  for (let i = 1; i < rows.length; i++) {
    const current = rows[i];
    const prev = rows[i - 1];
    const high = toNumber(current.high);
    const low = toNumber(current.low);
    const prevClose = toNumber(prev.close);

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const recent = trueRanges.slice(-period);
  return average(recent);
};

const calculateTechnicalSnapshot = (history = []) => {
  const rows = Array.isArray(history) ? history : [];
  const closes = rows.map((item) => toNumber(item.close)).filter((value) => value > 0);
  const highs = rows.map((item) => toNumber(item.high)).filter((value) => value > 0);
  const lows = rows.map((item) => toNumber(item.low)).filter((value) => value > 0);

  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const ema20 = computeEMAValue(closes, 20);
  const ema50 = computeEMAValue(closes, 50);
  const rsi14 = computeRSI(closes, 14);
  const macd = computeMACD(closes);
  const atr14 = computeATR(rows, 14);

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const current = closes[i];
    if (prev > 0 && current > 0) {
      returns.push(Math.log(current / prev));
    }
  }

  const volatility30 = (() => {
    const recent = returns.slice(-30);
    if (!recent.length) return null;
    const deviation = stdDev(recent);
    if (!Number.isFinite(deviation)) return null;
    return deviation * Math.sqrt(252) * 100;
  })();

  const support = lows.length ? Math.min(...lows.slice(-20)) : null;
  const resistance = highs.length ? Math.max(...highs.slice(-20)) : null;
  const current = closes.length ? closes[closes.length - 1] : null;

  const trend = (() => {
    if (!current || !sma20 || !sma50) return 'unknown';
    if (current > sma20 && sma20 > sma50) return 'bullish';
    if (current < sma20 && sma20 < sma50) return 'bearish';
    return 'sideways';
  })();

  return {
    current: roundTo(current),
    sma20: roundTo(sma20),
    sma50: roundTo(sma50),
    ema20: roundTo(ema20),
    ema50: roundTo(ema50),
    rsi14: roundTo(rsi14),
    macd: {
      macd: roundTo(macd.macd, 4),
      signal: roundTo(macd.signal, 4),
      histogram: roundTo(macd.histogram, 4)
    },
    atr14: roundTo(atr14),
    volatility30d: roundTo(volatility30),
    support: roundTo(support),
    resistance: roundTo(resistance),
    trend
  };
};

const mapQuoteData = (symbol, data) => {
  const price = toNumber(data.regularMarketPrice);
  const change = toNumber(data.regularMarketChange);
  const previousClose = toNumber(data.regularMarketPreviousClose);
  const derivedChangePercent = previousClose ? (change / previousClose) * 100 : 0;

  return {
    symbol,
    name: data.longName || data.shortName || data.displayName || symbol,
    price,
    change,
    changePercent: toNullableNumber(data.regularMarketChangePercent) ?? Number(derivedChangePercent.toFixed(2)),
    volume: toNumber(data.regularMarketVolume),
    marketCap: toNumber(data.marketCap),
    high52w: toNumber(data.fiftyTwoWeekHigh),
    low52w: toNumber(data.fiftyTwoWeekLow),
    pe: toNullableNumber(data.trailingPE),
    eps: toNullableNumber(data.epsTrailingTwelveMonths),
    open: toNumber(data.regularMarketOpen),
    previousClose,
    dayHigh: toNumber(data.regularMarketDayHigh),
    dayLow: toNumber(data.regularMarketDayLow),
    exchange: normalizeExchangeName(data.fullExchangeName || data.exchange || data.exchangeName || '', symbol),
    currency: data.financialCurrency || data.currency || 'INR',
    timestamp: new Date().toISOString()
  };
};

const fetchQuoteFromYahoo = async (symbol) => {
  const data = await yahooFinance.quote(symbol);
  if (!data || data.regularMarketPrice === undefined || data.regularMarketPrice === null) {
    throw new Error(`No live quote available for ${symbol}`);
  }
  return mapQuoteData(symbol, data);
};

const fetchHistoryFromYahoo = async (symbol, period = '1y', interval = '1d') => {
  const { period1, period2 } = resolvePeriodDates(period);
  const yfInterval = resolveInterval(interval);

  const response = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: yfInterval
  });

  const quotes = Array.isArray(response?.quotes) ? response.quotes : [];
  if (!quotes.length) throw new Error(`No historical data available for ${symbol}`);

  return quotes
    .map((q) => ({
      date: formatDate(q.date),
      open: toNumber(q.open),
      high: toNumber(q.high),
      low: toNumber(q.low),
      close: toNumber(q.close),
      volume: toNumber(q.volume)
    }))
    .filter((q) => q.date && q.close > 0);
};

const getStockQuote = async (symbol) => {
  const cacheKey = `quote_${symbol}`;
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  try {
    const candidates = getCandidateSymbols(symbol);
    let result = null;

    for (const candidate of candidates) {
      try {
        result = await fetchQuoteFromYahoo(candidate);
        break;
      } catch (e) {
        // Try next candidate symbol variant.
      }
    }

    if (!result) throw new Error(`No quote found for ${symbol}`);

    await cache.market.set(cacheKey, result);
    return result;
  } catch (err) {
    // Fallback: generate realistic mock data when live providers are unavailable
    return getMockStockData(symbol);
  }
};

const getHistoricalData = async (symbol, period = '1y', interval = '1d') => {
  const cacheKey = `history_${symbol}_${period}_${interval}`;
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  try {
    const candidates = getCandidateSymbols(symbol);
    let result = null;

    for (const candidate of candidates) {
      try {
        result = await fetchHistoryFromYahoo(candidate, period, interval);
        break;
      } catch (e) {
        // Try next candidate symbol variant.
      }
    }

    if (!result) throw new Error(`No historical data found for ${symbol}`);

    await cache.market.set(cacheKey, result);
    return result;
  } catch (err) {
    return generateMockHistory(symbol, period);
  }
};

const getDualExchangeQuotes = async (symbol) => {
  const clean = String(symbol || '').trim();
  if (!clean) {
    throw new Error('Symbol is required');
  }

  if (clean.startsWith('^')) {
    const indexQuote = await getStockQuote(clean);
    return {
      baseSymbol: clean,
      nse: indexQuote,
      bse: null
    };
  }

  const baseSymbol = resolveIndianBaseSymbol(clean);
  const [nseResult, bseResult] = await Promise.allSettled([
    getStockQuote(`${baseSymbol}.NS`),
    getStockQuote(`${baseSymbol}.BO`)
  ]);

  const nse = nseResult.status === 'fulfilled'
    ? { ...nseResult.value, symbol: `${baseSymbol}.NS`, market: 'NSE' }
    : null;
  const bse = bseResult.status === 'fulfilled'
    ? { ...bseResult.value, symbol: `${baseSymbol}.BO`, market: 'BSE' }
    : null;

  if (!nse && !bse) {
    throw new Error(`No NSE/BSE quote found for ${symbol}`);
  }

  return { baseSymbol, nse, bse };
};

const searchStocks = async (query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];

  try {
    const response = await yahooFinance.search(query);
    const quotes = Array.isArray(response?.quotes) ? response.quotes : [];

    const mapped = quotes
      .filter((q) => {
        if (!q?.symbol) return false;
        const rawType = String(q.quoteType || q.typeDisp || '').toUpperCase();
        if (!rawType) return true;
        return rawType.includes('EQUITY') || rawType.includes('COMMON STOCK') || rawType.includes('STOCK');
      })
      .map((q) => {
        const symbol = String(q.symbol || '').trim().toUpperCase();
        const baseSymbol = resolveIndianBaseSymbol(symbol);
        const name = q.longname || q.shortname || q.displayName || q.symbol;
        const nameLower = String(name || '').toLowerCase();
        const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');

        let rank = 0;
        if (baseSymbol.toLowerCase() === normalizedQuery) rank += 12;
        if (baseSymbol.toLowerCase().startsWith(normalizedQuery)) rank += 8;
        if (nameLower.includes(normalizedQuery)) rank += 4;
        if (symbol.endsWith('.NS')) rank += 3;
        if (symbol.endsWith('.BO')) rank += 2;

        return {
          symbol,
          baseSymbol,
          name,
          longName: name,
          exchange: normalizeExchangeName(q.exchDisp || q.exchange || '', symbol),
          type: q.quoteType || q.typeDisp || '',
          isIndian,
          rank
        };
      })
      .sort((a, b) => {
        if (Number(b.isIndian) !== Number(a.isIndian)) return Number(b.isIndian) - Number(a.isIndian);
        return toNumber(b.rank) - toNumber(a.rank);
      });

    const preferred = mapped.filter((item) => item.isIndian);
    const workingSet = preferred.length ? preferred : mapped;

    const deduped = [];
    const seenBase = new Set();
    for (const item of workingSet) {
      const dedupeKey = item.baseSymbol || item.symbol;
      if (seenBase.has(dedupeKey)) continue;
      seenBase.add(dedupeKey);
      deduped.push(item);
      if (deduped.length >= 12) break;
    }

    const enrichedSettled = await Promise.allSettled(deduped.map(async (item) => {
      const quote = await getStockQuote(item.symbol);
      return {
        symbol: item.symbol,
        name: quote.name || item.name,
        longName: quote.name || item.longName,
        exchange: normalizeExchangeName(quote.exchange || item.exchange || '', item.symbol),
        type: item.type,
        price: toNumber(quote.price),
        change: toNumber(quote.change),
        changePercent: toNumber(quote.changePercent),
        volume: toNumber(quote.volume),
        marketCap: toNumber(quote.marketCap),
        isMock: Boolean(quote.isMock)
      };
    }));

    const enriched = enrichedSettled
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);

    if (enriched.length) return enriched;
    throw new Error('No search results');
  } catch (err) {
    const fallback = indianStocksDB
      .filter((stock) => stock.symbol.toLowerCase().includes(normalizedQuery) || stock.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 10);

    const settled = await Promise.allSettled(fallback.map(async (stock) => {
      const quote = await getStockQuote(stock.symbol);
      return {
        symbol: stock.symbol,
        name: quote.name || stock.name,
        longName: quote.name || stock.name,
        exchange: normalizeExchangeName(quote.exchange || '', stock.symbol),
        type: 'EQUITY',
        price: toNumber(quote.price),
        change: toNumber(quote.change),
        changePercent: toNumber(quote.changePercent),
        volume: toNumber(quote.volume),
        marketCap: toNumber(quote.marketCap),
        isMock: Boolean(quote.isMock)
      };
    }));

    return settled
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);
  }
};

const getTopGainers = async () => {
  const cacheKey = 'top_gainers';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  try {
    const quotes = await Promise.all(indianStocksDB.map((s) => getStockQuote(s.symbol).catch(() => null)));
    const gainers = quotes
      .filter(Boolean)
      .filter((q) => toNumber(q.changePercent) > 0)
      .sort((a, b) => toNumber(b.changePercent) - toNumber(a.changePercent))
      .slice(0, 5);

    if (gainers.length) {
      await cache.market.set(cacheKey, gainers);
      return gainers;
    }

    throw new Error('No live gainers');
  } catch (err) {
    // Deterministic fallback snapshot when providers fail.
    const result = indianStocksDB.slice(0, 5).map((stock) => {
      const quote = getMockStockData(stock.symbol);
      return {
        ...stock,
        ...quote,
        changePercent: Math.max(0.2, Math.abs(toNumber(quote.changePercent)))
      };
    });

    await cache.market.set(cacheKey, result);
    return result;
  }
};

const getTopLosers = async () => {
  const cacheKey = 'top_losers';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  try {
    const quotes = await Promise.all(indianStocksDB.map((s) => getStockQuote(s.symbol).catch(() => null)));
    const losers = quotes
      .filter(Boolean)
      .filter((q) => toNumber(q.changePercent) < 0)
      .sort((a, b) => toNumber(a.changePercent) - toNumber(b.changePercent))
      .slice(0, 5);

    if (losers.length) {
      await cache.market.set(cacheKey, losers);
      return losers;
    }

    throw new Error('No live losers');
  } catch (err) {
    const result = indianStocksDB.slice(5, 10).map((stock) => {
      const quote = getMockStockData(stock.symbol);
      return {
        ...stock,
        ...quote,
        changePercent: -Math.max(0.2, Math.abs(toNumber(quote.changePercent)))
      };
    });

    await cache.market.set(cacheKey, result);
    return result;
  }
};

const getPopularStocks = async () => {
  const cacheKey = 'popular_stocks_live';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  const candidates = indianStocksDB.slice(0, 20);
  const settled = await Promise.allSettled(candidates.map(async (stock) => {
    const quote = await getStockQuote(stock.symbol);
    return {
      ...stock,
      symbol: quote.symbol || stock.symbol,
      name: quote.name || stock.name,
      price: toNumber(quote.price),
      change: toNumber(quote.change),
      changePercent: toNumber(quote.changePercent),
      volume: toNumber(quote.volume),
      marketCap: toNumber(quote.marketCap),
      exchange: quote.exchange || (stock.symbol.endsWith('.BO') ? 'BSE' : 'NSE'),
      isMock: Boolean(quote.isMock)
    };
  }));

  const popular = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);

  if (!popular.length) {
    const fallback = candidates.map((stock) => ({ ...stock, ...getMockStockData(stock.symbol) }));
    await cache.market.set(cacheKey, fallback);
    return fallback;
  }

  await cache.market.set(cacheKey, popular);
  return popular;
};

// Mock data when API keys or live feeds are unavailable
const getMockStockData = (symbol) => {
  const normalizedSymbol = String(symbol || '').trim();
  const stock = indianStocksDB.find((s) => s.symbol === normalizedSymbol) || { symbol: normalizedSymbol, name: normalizedSymbol };
  const seed = stableSymbolSeed(normalizedSymbol);

  const basePrice = 140 + (seededRandom(seed + 3) * 2900);
  const changePercent = (seededRandom(seed + 7) - 0.5) * 4.2;
  const numericPrice = Number(basePrice.toFixed(2));
  const numericChange = Number(((numericPrice * changePercent) / 100).toFixed(2));
  const previousClose = Number((numericPrice - numericChange).toFixed(2));

  const highFactor = 1 + (seededRandom(seed + 9) * 0.55);
  const lowFactor = 0.55 + (seededRandom(seed + 11) * 0.35);

  return {
    symbol: normalizedSymbol,
    name: stock.name,
    price: numericPrice,
    change: numericChange,
    changePercent: Number(((numericChange / numericPrice) * 100).toFixed(2)),
    volume: Math.round(300000 + seededRandom(seed + 13) * 5200000),
    marketCap: Math.round(1.8e11 + seededRandom(seed + 17) * 5.5e12),
    high52w: Number((numericPrice * highFactor).toFixed(2)),
    low52w: Number((numericPrice * lowFactor).toFixed(2)),
    pe: Number((9 + seededRandom(seed + 19) * 42).toFixed(2)),
    eps: Number((15 + seededRandom(seed + 23) * 180).toFixed(2)),
    open: Number((previousClose * (1 + (seededRandom(seed + 29) - 0.5) * 0.02)).toFixed(2)),
    previousClose,
    dayHigh: Number((Math.max(numericPrice, previousClose) * 1.01).toFixed(2)),
    dayLow: Number((Math.min(numericPrice, previousClose) * 0.99).toFixed(2)),
    exchange: 'NSE',
    currency: 'INR',
    timestamp: new Date().toISOString(),
    isMock: true
  };
};

const generateMockHistory = (symbol, period = '1y') => {
  const points = period === '1d' ? 78 : period === '1w' ? 35 : period === '1mo' ? 30 : period === '3mo' ? 90 : 252;
  const basePrice = Math.random() * 2000 + 200;
  const data = [];
  let price = basePrice;

  for (let i = points; i >= 0; i--) {
    price = price * (1 + (Math.random() - 0.48) * 0.025);
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      open: price * (1 - Math.random() * 0.01),
      high: price * (1 + Math.random() * 0.015),
      low: price * (1 - Math.random() * 0.015),
      close: price,
      volume: Math.floor(Math.random() * 3000000 + 500000)
    });
  }
  return data;
};

const indianStocksDB = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd', sector: 'Energy' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'Information Technology' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd', sector: 'Financial Services' },
  { symbol: 'INFY.NS', name: 'Infosys Ltd', sector: 'Information Technology' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Ltd', sector: 'Financial Services' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever Ltd', sector: 'Consumer Defensive' },
  { symbol: 'ITC.NS', name: 'ITC Ltd', sector: 'Consumer Defensive' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', sector: 'Financial Services' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd', sector: 'Communication Services' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', sector: 'Financial Services' },
  { symbol: 'WIPRO.NS', name: 'Wipro Ltd', sector: 'Information Technology' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd', sector: 'Financial Services' },
  { symbol: 'HCLTECH.NS', name: 'HCL Technologies Ltd', sector: 'Information Technology' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints Ltd', sector: 'Materials' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki India Ltd', sector: 'Consumer Cyclical' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro Ltd', sector: 'Industrials' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank Ltd', sector: 'Financial Services' },
  { symbol: 'TITAN.NS', name: 'Titan Company Ltd', sector: 'Consumer Cyclical' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical Industries', sector: 'Healthcare' },
  { symbol: 'ONGC.NS', name: 'Oil and Natural Gas Corporation', sector: 'Energy' }
];

const INDUSTRY_PE_BENCHMARKS = {
  'Financial Services': 19.8,
  'Information Technology': 28.4,
  'Energy': 14.6,
  'Healthcare': 32.1,
  'Consumer Defensive': 51.2,
  'Consumer Cyclical': 43.8,
  Industrials: 34.9,
  Materials: 47.6,
  'Communication Services': 26.7
};

const QUOTE_SUMMARY_MODULES = [
  'assetProfile',
  'summaryDetail',
  'defaultKeyStatistics',
  'financialData',
  'price',
  'majorHoldersBreakdown',
  'institutionOwnership',
  'fundOwnership',
  'recommendationTrend'
];

const SCREENER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml'
};

const cleanHtmlText = (value = '') => String(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const normalizeFinancialRows = (rows = [], mode = 'yearly') => {
  return rows
    .map((row) => {
      const rawDate = Number(row?.date);
      if (!Number.isFinite(rawDate) || rawDate <= 0) return null;

      const date = new Date(rawDate > 1e12 ? rawDate : rawDate * 1000);
      if (Number.isNaN(date.getTime())) return null;

      const revenue = extractMetricFromKeys(row, ['totalRevenue', 'operatingRevenue']);
      const profit = extractMetricFromKeys(row, ['netIncome', 'netIncomeCommonStockholders', 'netIncomeFromContinuingOperationNetMinorityInterest']);
      const netWorth = extractMetricFromKeys(row, ['stockholdersEquity', 'totalStockholderEquity', 'totalEquityGrossMinorityInterest']);

      if (revenue === null && profit === null && netWorth === null) return null;

      return {
        period: mode === 'quarterly' ? formatQuarterLabel(date) : formatYearLabel(date),
        periodDate: formatDate(date),
        revenue,
        profit,
        netWorth
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.periodDate).localeCompare(String(b.periodDate)));
};

const normalizeLegacyFinancialRows = (rows = [], mode = 'yearly') => {
  return rows
    .map((item) => {
      const endDateRaw = item?.endDate?.fmt || item?.endDate || '';
      const parsedDate = new Date(endDateRaw);
      const date = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;

      const revenue = extractRawMetric(item?.totalRevenue);
      const profit = extractRawMetric(item?.netIncome);
      const netWorth = extractRawMetric(item?.totalStockholderEquity);
      if (!date || (revenue === null && profit === null && netWorth === null)) return null;

      return {
        period: mode === 'quarterly' ? formatQuarterLabel(date) : formatYearLabel(date),
        periodDate: formatDate(date),
        revenue,
        profit,
        netWorth
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.periodDate).localeCompare(String(b.periodDate)));
};

const fetchFundamentalsSeriesRows = async (symbol, type, period1) => {
  const candidates = getCandidateSymbols(symbol);

  for (const candidate of candidates) {
    try {
      const rows = await yahooFinance.fundamentalsTimeSeries(candidate, {
        period1,
        period2: new Date(),
        type,
        module: 'all'
      });

      if (Array.isArray(rows) && rows.length) {
        return rows;
      }
    } catch (err) {
      // Try next candidate symbol variant.
    }
  }

  return [];
};

const buildFinancialSeries = async (symbol, summary = {}) => {
  const [annualRows, quarterlyRows] = await Promise.all([
    fetchFundamentalsSeriesRows(symbol, 'annual', '2017-01-01'),
    fetchFundamentalsSeriesRows(symbol, 'quarterly', '2022-01-01')
  ]);

  const yearly = normalizeFinancialRows(annualRows, 'yearly').slice(-8);
  const quarterly = normalizeFinancialRows(quarterlyRows, 'quarterly').slice(-12);

  if (yearly.length || quarterly.length) {
    return {
      source: 'Yahoo fundamentalsTimeSeries',
      yearly,
      quarterly,
      points: (yearly.length ? yearly : quarterly).slice(-6),
      latestYearly: yearly.length ? yearly[yearly.length - 1] : null,
      latestQuarterly: quarterly.length ? quarterly[quarterly.length - 1] : null
    };
  }

  const legacyYearly = normalizeLegacyFinancialRows(summary?.incomeStatementHistory?.incomeStatementHistory || [], 'yearly').slice(-8);
  const legacyQuarterly = normalizeLegacyFinancialRows(summary?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [], 'quarterly').slice(-12);

  return {
    source: 'Yahoo quoteSummary',
    yearly: legacyYearly,
    quarterly: legacyQuarterly,
    points: (legacyYearly.length ? legacyYearly : legacyQuarterly).slice(-6),
    latestYearly: legacyYearly.length ? legacyYearly[legacyYearly.length - 1] : null,
    latestQuarterly: legacyQuarterly.length ? legacyQuarterly[legacyQuarterly.length - 1] : null
  };
};

const buildShareholdingPatternFromYahoo = (summary = {}) => {
  const major = summary?.majorHoldersBreakdown || {};

  const insidersPct = extractRawMetric(major.insidersPercentHeld);
  const institutionsPct = extractRawMetric(major.institutionsPercentHeld);
  const floatPct = extractRawMetric(major.floatPercentInsiders);

  const insiders = insidersPct === null ? null : roundTo(insidersPct * 100, 2);
  const institutions = institutionsPct === null ? null : roundTo(institutionsPct * 100, 2);
  const freeFloat = floatPct === null ? null : roundTo(floatPct * 100, 2);
  const publicOthers = (insiders !== null && institutions !== null)
    ? roundTo(Math.max(0, 100 - insiders - institutions), 2)
    : null;

  const distribution = [
    { label: 'Promoters', value: insiders },
    { label: 'FII + DII (Proxy)', value: institutions },
    { label: 'Public', value: publicOthers },
    { label: 'Free Float', value: freeFloat }
  ].filter((item) => item.value !== null);

  const topInstitutional = [];
  const institutionRows = summary?.institutionOwnership?.ownershipList || [];
  const fundRows = summary?.fundOwnership?.ownershipList || [];

  for (const holder of [...institutionRows, ...fundRows]) {
    if (!holder?.organization) continue;
    const pctHeld = extractRawMetric(holder?.pctHeld);
    if (pctHeld === null) continue;

    topInstitutional.push({
      name: holder.organization,
      percent: roundTo(pctHeld * 100, 2)
    });
  }

  topInstitutional.sort((a, b) => b.percent - a.percent);

  return {
    distribution,
    topInstitutional: topInstitutional.slice(0, 8),
    source: 'Yahoo major holders',
    asOf: null,
    quarterly: [],
    yearly: []
  };
};

const extractScreenerTableById = (html, sectionId) => {
  const pattern = new RegExp(`<div id=\"${sectionId}\"[\\s\\S]*?<table[\\s\\S]*?<\\/table>`, 'i');
  return html.match(pattern)?.[0] || '';
};

const mapShareholdingLabelToKey = (label = '') => {
  const normalized = String(label).toLowerCase();
  if (normalized.includes('promoter')) return 'promoters';
  if (normalized.includes('fii') || normalized.includes('foreign institution')) return 'fii';
  if (normalized.includes('dii') || normalized.includes('domestic institution')) return 'dii';
  if (normalized.includes('public')) return 'public';
  return null;
};

const parseScreenerShareholdingTable = (tableSectionHtml = '') => {
  const tableHtml = String(tableSectionHtml || '');
  if (!tableHtml) return { series: [], distribution: [], asOf: null };

  const headerRow = tableHtml.match(/<thead[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1] || '';
  const headers = [...headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((item) => cleanHtmlText(item[1]))
    .filter(Boolean);

  const periods = headers.slice(1);
  if (!periods.length) return { series: [], distribution: [], asOf: null };

  const bodyHtml = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  const rowMatches = bodyHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rowValues = {};

  for (const rowHtml of rowMatches) {
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtmlText(cell[1]));
    if (cells.length < 2) continue;

    const key = mapShareholdingLabelToKey(cells[0]);
    if (!key) continue;

    rowValues[key] = cells.slice(1).map((value) => {
      const parsed = toPercentNumber(value);
      return parsed === null ? null : roundTo(parsed, 2);
    });
  }

  const series = periods
    .map((period, index) => ({
      period,
      promoters: rowValues.promoters?.[index] ?? null,
      fii: rowValues.fii?.[index] ?? null,
      dii: rowValues.dii?.[index] ?? null,
      public: rowValues.public?.[index] ?? null
    }))
    .filter((item) => item.promoters !== null || item.fii !== null || item.dii !== null || item.public !== null);

  const latest = series.length ? series[series.length - 1] : null;
  const distribution = latest
    ? [
      { label: 'Promoters', value: latest.promoters },
      { label: 'FIIs', value: latest.fii },
      { label: 'DIIs', value: latest.dii },
      { label: 'Public', value: latest.public }
    ].filter((item) => item.value !== null)
    : [];

  return {
    series,
    distribution,
    asOf: latest?.period || null
  };
};

const fetchIndiaShareholding = async (symbol) => {
  const baseSymbol = resolveIndianBaseSymbol(symbol);
  if (!baseSymbol) return null;

  const urls = [
    `https://www.screener.in/company/${encodeURIComponent(baseSymbol)}/consolidated/`,
    `https://www.screener.in/company/${encodeURIComponent(baseSymbol)}/`
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        timeout: 12000,
        headers: SCREENER_HEADERS
      });

      const html = String(response.data || '');
      if (!html.includes('Shareholding Pattern')) continue;

      const quarterly = parseScreenerShareholdingTable(extractScreenerTableById(html, 'quarterly-shp'));
      const yearly = parseScreenerShareholdingTable(extractScreenerTableById(html, 'yearly-shp'));

      if (!quarterly.series.length && !yearly.series.length) continue;

      return {
        source: 'Screener India Filings',
        distribution: quarterly.distribution.length ? quarterly.distribution : yearly.distribution,
        asOf: quarterly.asOf || yearly.asOf || null,
        quarterly: quarterly.series.slice(-12),
        yearly: yearly.series.slice(-8)
      };
    } catch (err) {
      // Try next URL variant.
    }
  }

  return null;
};

const buildShareholdingPattern = async (summary = {}, symbol = '') => {
  const yahooPattern = buildShareholdingPatternFromYahoo(summary);
  const indiaShareholding = await fetchIndiaShareholding(symbol);

  if (!indiaShareholding) {
    return yahooPattern;
  }

  return {
    ...yahooPattern,
    source: indiaShareholding.source,
    distribution: indiaShareholding.distribution.length ? indiaShareholding.distribution : yahooPattern.distribution,
    asOf: indiaShareholding.asOf,
    quarterly: indiaShareholding.quarterly,
    yearly: indiaShareholding.yearly
  };
};

const findStockMetadata = (symbol) => {
  const baseSymbol = resolveIndianBaseSymbol(symbol);
  return indianStocksDB.find((item) => resolveIndianBaseSymbol(item.symbol) === baseSymbol) || null;
};

const buildRelatedStocks = async (symbol, sector) => {
  const baseSymbol = resolveIndianBaseSymbol(symbol);

  const primary = indianStocksDB.filter((item) => item.sector === sector && resolveIndianBaseSymbol(item.symbol) !== baseSymbol);
  const fallback = indianStocksDB.filter((item) => resolveIndianBaseSymbol(item.symbol) !== baseSymbol);
  const candidates = [...primary, ...fallback].slice(0, 6);

  const settled = await Promise.allSettled(candidates.map(async (candidate) => {
    const quote = await getStockQuote(candidate.symbol);
    return {
      symbol: candidate.symbol,
      name: candidate.name,
      sector: candidate.sector,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      exchange: quote.exchange || (candidate.symbol.endsWith('.BO') ? 'BSE' : 'NSE')
    };
  }));

  return settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value)
    .slice(0, 4);
};

const getQuoteSummary = async (symbol) => {
  const candidates = getCandidateSymbols(symbol);

  for (const candidate of candidates) {
    try {
      const summary = await yahooFinance.quoteSummary(candidate, {
        modules: QUOTE_SUMMARY_MODULES
      });
      if (summary) return summary;
    } catch (err) {
      // Try next candidate.
    }
  }

  return {};
};

const getStockDeepDetails = async (symbol) => {
  const cacheKey = `stock_deep_${symbol}`;
  const cached = await cache.fundamentals.get(cacheKey);
  if (cached) return cached;

  const quote = await getStockQuote(symbol);
  const history = await getHistoricalData(symbol, '1y', '1d');
  const summary = await getQuoteSummary(quote.symbol || symbol);
  const externalFundamentals = await fetchFundamentalsWithFallback(quote.symbol || symbol);
  const externalData = externalFundamentals?.data || {};

  const metadata = findStockMetadata(symbol);
  const sector = summary?.assetProfile?.sector || externalData.sector || metadata?.sector || 'Unknown';
  const industry = summary?.assetProfile?.industry || externalData.industry || '';
  const industryPe = INDUSTRY_PE_BENCHMARKS[sector] || null;

  const technicals = calculateTechnicalSnapshot(history);
  const [financials, shareholding, relatedStocks] = await Promise.all([
    buildFinancialSeries(quote.symbol || symbol, summary),
    buildShareholdingPattern(summary, quote.symbol || symbol),
    buildRelatedStocks(symbol, sector)
  ]);

  const summaryDetail = summary?.summaryDetail || {};
  const defaultStats = summary?.defaultKeyStatistics || {};
  const financialData = summary?.financialData || {};

  const yahooFundamentals = {
    marketCap: quote.marketCap || extractRawMetric(summaryDetail.marketCap),
    pe: quote.pe || extractRawMetric(summaryDetail.trailingPE),
    eps: quote.eps || extractRawMetric(defaultStats.trailingEps),
    pb: extractRawMetric(defaultStats.priceToBook),
    roe: toPercentValue(extractRawMetric(financialData.returnOnEquity)),
    roa: toPercentValue(extractRawMetric(financialData.returnOnAssets)),
    dividendYield: toPercentValue(extractRawMetric(summaryDetail.dividendYield)),
    industryPe,
    bookValue: extractRawMetric(defaultStats.bookValue),
    debtToEquity: extractRawMetric(financialData.debtToEquity),
    faceValue: extractRawMetric(defaultStats.lastSplitFactor),
    profitMargins: toPercentValue(extractRawMetric(financialData.profitMargins)),
    operatingMargins: toPercentValue(extractRawMetric(financialData.operatingMargins))
  };

  const fundamentals = mergeFundamentals(yahooFundamentals, externalData);
  fundamentals.dataSources = externalFundamentals.providerUsed
    ? ['yahoo-finance2', externalFundamentals.providerUsed]
    : ['yahoo-finance2'];
  fundamentals.providerUsed = externalFundamentals.providerUsed || 'yahoo-finance2';
  fundamentals.providerCoverage = externalFundamentals.coverage || 0;

  const recommendationRaw = summary?.recommendationTrend?.trend?.[0] || null;
  const recommendation = recommendationRaw
    ? {
      strongBuy: toNumber(recommendationRaw.strongBuy),
      buy: toNumber(recommendationRaw.buy),
      hold: toNumber(recommendationRaw.hold),
      sell: toNumber(recommendationRaw.sell),
      strongSell: toNumber(recommendationRaw.strongSell)
    }
    : null;

  const result = {
    symbol: quote.symbol,
    name: quote.name,
    quote,
    companyInfo: {
      sector,
      industry,
      website: summary?.assetProfile?.website || '',
      description: summary?.assetProfile?.longBusinessSummary || ''
    },
    overview: {
      open: quote.open,
      previousClose: quote.previousClose,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      volume: quote.volume,
      high52w: quote.high52w,
      low52w: quote.low52w,
      lowerCircuitEstimate: quote.previousClose ? roundTo(quote.previousClose * 0.9) : null,
      upperCircuitEstimate: quote.previousClose ? roundTo(quote.previousClose * 1.1) : null
    },
    technicals,
    fundamentals,
    financials,
    shareholding,
    recommendation,
    relatedStocks
  };

  await cache.fundamentals.set(cacheKey, result);
  return result;
};

const FNO_UNDERLYINGS = [
  { symbol: '^NSEI', name: 'NIFTY 50', lotSize: 75, strikeStep: 50 },
  { symbol: '^NSEBANK', name: 'BANK NIFTY', lotSize: 15, strikeStep: 100 },
  { symbol: 'RELIANCE.NS', name: 'RELIANCE', lotSize: 250, strikeStep: 20 },
  { symbol: 'TCS.NS', name: 'TCS', lotSize: 150, strikeStep: 20 },
  { symbol: 'HDFCBANK.NS', name: 'HDFCBANK', lotSize: 550, strikeStep: 20 },
  { symbol: 'INFY.NS', name: 'INFY', lotSize: 300, strikeStep: 20 }
];

const INDIA_BOND_BENCHMARKS = [
  {
    id: 'gsec-10y',
    name: 'India Govt 10Y G-Sec',
    issuer: 'Government of India',
    type: 'Government Bond',
    maturity: '10Y',
    coupon: 7.18,
    yield: 7.12,
    price: 100.35,
    rating: 'Sovereign'
  },
  {
    id: 'gsec-5y',
    name: 'India Govt 5Y G-Sec',
    issuer: 'Government of India',
    type: 'Government Bond',
    maturity: '5Y',
    coupon: 7.01,
    yield: 6.93,
    price: 100.74,
    rating: 'Sovereign'
  },
  {
    id: 'rbi-floating-rate',
    name: 'RBI Floating Rate Savings Bond',
    issuer: 'Reserve Bank of India',
    type: 'Savings Bond',
    maturity: '7Y',
    coupon: 8.05,
    yield: 8.05,
    price: 100,
    rating: 'Sovereign'
  },
  {
    id: 'psu-aaa-5y',
    name: 'AAA PSU Bond Basket',
    issuer: 'Select PSU Issuers',
    type: 'Corporate Bond',
    maturity: '5Y',
    coupon: 7.65,
    yield: 7.58,
    price: 99.85,
    rating: 'AAA'
  },
  {
    id: 'state-dev-loan',
    name: 'State Development Loan Basket',
    issuer: 'State Governments',
    type: 'SDL',
    maturity: '10Y',
    coupon: 7.42,
    yield: 7.36,
    price: 99.67,
    rating: 'AA+'
  }
];

const UPCOMING_IPOS = [
  {
    id: 'ipo-aether-energy',
    company: 'Aether Energy Systems Ltd',
    sector: 'Renewable Energy',
    issueOpen: '2026-03-25',
    issueClose: '2026-03-28',
    priceBand: '₹410 - ₹430',
    lotSize: 34,
    issueSizeCr: 1250,
    gmp: '₹42',
    status: 'Upcoming',
    exchange: 'NSE/BSE'
  },
  {
    id: 'ipo-vyom-logistics',
    company: 'Vyom Logistics Ltd',
    sector: 'Logistics',
    issueOpen: '2026-03-22',
    issueClose: '2026-03-26',
    priceBand: '₹188 - ₹198',
    lotSize: 75,
    issueSizeCr: 680,
    gmp: '₹11',
    status: 'Open',
    exchange: 'NSE'
  },
  {
    id: 'ipo-nova-healthtech',
    company: 'Nova Healthtech Ltd',
    sector: 'Healthcare',
    issueOpen: '2026-04-02',
    issueClose: '2026-04-05',
    priceBand: '₹620 - ₹648',
    lotSize: 23,
    issueSizeCr: 2100,
    gmp: '₹58',
    status: 'Upcoming',
    exchange: 'NSE/BSE'
  },
  {
    id: 'ipo-urban-housing-reit',
    company: 'Urban Housing REIT',
    sector: 'REIT',
    issueOpen: '2026-03-18',
    issueClose: '2026-03-20',
    priceBand: '₹305 - ₹320',
    lotSize: 46,
    issueSizeCr: 5400,
    gmp: '₹7',
    status: 'Closing Soon',
    exchange: 'NSE'
  }
];

const toNearestStrike = (price, step) => {
  const numericPrice = toNumber(price);
  const strikeStep = toNumber(step, 50);
  if (!numericPrice) return strikeStep;
  return Math.max(strikeStep, Math.round(numericPrice / strikeStep) * strikeStep);
};

const getCurrentMonthlyExpiry = () => {
  const today = new Date();
  const lastThursday = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  while (lastThursday.getDay() !== 4) {
    lastThursday.setDate(lastThursday.getDate() - 1);
  }
  return lastThursday.toISOString().split('T')[0];
};

const getFOInstruments = async () => {
  const cacheKey = 'india_fno_snapshot';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  const expiry = getCurrentMonthlyExpiry();

  const settled = await Promise.allSettled(FNO_UNDERLYINGS.map(async (item) => {
    const quote = await getStockQuote(item.symbol);
    const ltp = toNumber(quote.price);
    const strike = toNearestStrike(ltp, item.strikeStep);

    const future = {
      id: `${item.name}-FUT`,
      instrument: `${item.name} FUT`,
      contractType: 'FUT',
      underlying: item.symbol,
      lotSize: item.lotSize,
      expiry,
      ltp,
      changePercent: toNumber(quote.changePercent),
      exchange: 'NSE',
      timestamp: new Date().toISOString()
    };

    const callOption = {
      id: `${item.name}-${strike}-CE`,
      instrument: `${item.name} ${strike} CE`,
      contractType: 'OPT',
      optionType: 'CE',
      strike,
      underlying: item.symbol,
      lotSize: item.lotSize,
      expiry,
      ltp: Number(Math.max(1, (ltp - strike) * 0.35 + ltp * 0.015).toFixed(2)),
      changePercent: Number((quote.changePercent * 0.85).toFixed(2)),
      exchange: 'NSE',
      timestamp: new Date().toISOString()
    };

    const putOption = {
      id: `${item.name}-${strike}-PE`,
      instrument: `${item.name} ${strike} PE`,
      contractType: 'OPT',
      optionType: 'PE',
      strike,
      underlying: item.symbol,
      lotSize: item.lotSize,
      expiry,
      ltp: Number(Math.max(1, (strike - ltp) * 0.35 + ltp * 0.014).toFixed(2)),
      changePercent: Number((quote.changePercent * -0.7).toFixed(2)),
      exchange: 'NSE',
      timestamp: new Date().toISOString()
    };

    return [future, callOption, putOption];
  }));

  const instruments = settled
    .filter((entry) => entry.status === 'fulfilled')
    .flatMap((entry) => entry.value);

  await cache.market.set(cacheKey, instruments);
  return instruments;
};

const getIndianBonds = async () => {
  const cacheKey = 'india_bond_snapshot';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  const bonds = INDIA_BOND_BENCHMARKS.map((bond, index) => ({
    ...bond,
    dayChangeBps: Number((((index % 2 === 0 ? 1 : -1) * (index + 1)) * 0.6).toFixed(2)),
    timestamp: now,
    country: 'India'
  }));

  await cache.market.set(cacheKey, bonds);
  return bonds;
};

const getUpcomingIPOs = async () => {
  const cacheKey = 'india_ipo_snapshot';
  const cached = await cache.market.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  const ipos = UPCOMING_IPOS.map((ipo) => ({ ...ipo, timestamp: now }));
  await cache.market.set(cacheKey, ipos);
  return ipos;
};

const getMarketProviderStatus = () => ({
  marketData: {
    provider: 'yahoo-finance2',
    configured: true
  },
  fundamentals: getFundamentalsProviderStatus()
});

module.exports = {
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
  getMarketProviderStatus,
  indianStocksDB
};
