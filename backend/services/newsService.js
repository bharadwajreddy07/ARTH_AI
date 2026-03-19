const axios = require('axios');
const cache = require('./cache');
const { analyzeSentiment } = require('./sentimentService');
const { getStockQuote } = require('./stockService');

const REQUEST_TIMEOUT = 12000;

const INDIA_RSS_FEEDS = [
  { source: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/business.xml' },
  { source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'CNBC TV18', url: 'https://www.cnbctv18.com/commonfeeds/v1/eng/rss/market.xml' },
  { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' }
];

const CATEGORY_QUERY_MAP = {
  general: 'india stock market nifty sensex nse bse',
  india: 'india stock market nifty sensex nse bse rbi sebi fii dii',
  merger: 'india merger acquisition stake buyout open offer deal',
  forex: 'inr rupee dollar forex india',
  crypto: 'crypto bitcoin ethereum regulation india',
  fno: 'india futures options derivatives open interest nifty banknifty',
  bonds: 'india government bonds g-sec yield rbi treasury'
};

const CATEGORY_KEYWORDS = {
  merger: ['merger', 'acquisition', 'buyout', 'stake', 'deal', 'open offer', 'm&a'],
  forex: ['forex', 'currency', 'rupee', 'dollar', 'fx'],
  crypto: ['crypto', 'bitcoin', 'ethereum', 'token', 'blockchain'],
  fno: ['f&o', 'fno', 'futures', 'options', 'derivatives', 'open interest', 'oi'],
  bonds: ['bond', 'g-sec', 'treasury', 'yield', 'coupon', 'sovereign', 'rbi']
};

const INDIA_SOURCE_HINTS = [
  'moneycontrol',
  'economic times',
  'economictimes',
  'cnbctv18',
  'business standard',
  'mint',
  'livemint'
];

const GENERIC_HEADLINES = new Set(['market update', 'business update', 'news update', 'untitled']);

const toSlug = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');

const stripHtml = (value = '') => String(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const decodeXmlEntities = (value = '') => String(value)
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x2F;/g, '/')
  .replace(/&nbsp;/g, ' ');

const normalizeWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const toIsoFromUnixSeconds = (value) => {
  const unixSeconds = Number(value);
  if (!Number.isFinite(unixSeconds)) return new Date().toISOString();
  return new Date(unixSeconds * 1000).toISOString();
};

const toIsoDate = (value) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const tokenize = (value = '') => normalizeWhitespace(value)
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((token) => token.length > 2);

const STOCK_TOKEN_STOPWORDS = new Set([
  'ltd', 'limited', 'india', 'indian', 'stock', 'share', 'company', 'corp', 'inc', 'the',
  'bank', 'services', 'industries', 'corporation', 'holdings'
]);

const getStockSpecificTokens = (baseSymbol, quoteName) => {
  const symbolToken = String(baseSymbol || '').toLowerCase().trim();
  const nameTokens = tokenize(quoteName).filter((token) => !STOCK_TOKEN_STOPWORDS.has(token));
  const seed = [symbolToken, ...nameTokens].filter(Boolean);
  return Array.from(new Set(seed));
};

const isGenericHeadline = (headline = '') => {
  const normalized = normalizeWhitespace(headline).toLowerCase();
  return !normalized || GENERIC_HEADLINES.has(normalized);
};

const fallbackHeadlineFromSummary = (summary = '') => {
  const clean = normalizeWhitespace(summary);
  if (!clean) return 'Market update';
  return clean.length > 96 ? `${clean.slice(0, 96)}...` : clean;
};

const getFinnhubApiKey = () => String(process.env.FINNHUB_API_KEY || '').trim();

const getNewsProviderKeys = () => {
  const shared = String(process.env.NEWS_API_KEY || '').trim();
  const explicitNewsApi = String(process.env.NEWSAPI_KEY || '').trim();
  const explicitNewsData = String(process.env.NEWSDATA_API_KEY || '').trim();

  const sharedLooksLikeNewsData = shared.startsWith('pub_');
  const newsApiKey = explicitNewsApi || (!sharedLooksLikeNewsData ? shared : '');
  const newsDataKey = explicitNewsData || (sharedLooksLikeNewsData ? shared : '');

  return { newsApiKey, newsDataKey };
};

const getNewsProviderKeySources = () => {
  const shared = String(process.env.NEWS_API_KEY || '').trim();
  const explicitNewsApi = String(process.env.NEWSAPI_KEY || '').trim();
  const explicitNewsData = String(process.env.NEWSDATA_API_KEY || '').trim();

  const sharedLooksLikeNewsData = shared.startsWith('pub_');

  return {
    newsApi: explicitNewsApi
      ? 'NEWSAPI_KEY'
      : (!sharedLooksLikeNewsData && shared ? 'NEWS_API_KEY' : null),
    newsData: explicitNewsData
      ? 'NEWSDATA_API_KEY'
      : (sharedLooksLikeNewsData && shared ? 'NEWS_API_KEY' : null),
    finnhub: getFinnhubApiKey() ? 'FINNHUB_API_KEY' : null
  };
};

const sourceFallbackUrlBuilders = {
  'economic times': (headline) => `https://economictimes.indiatimes.com/topic/${toSlug(headline)}`,
  economictimes: (headline) => `https://economictimes.indiatimes.com/topic/${toSlug(headline)}`,
  mint: (headline) => `https://www.livemint.com/search?query=${encodeURIComponent(headline)}`,
  'business standard': (headline) => `https://www.business-standard.com/search?type=news&q=${encodeURIComponent(headline)}`,
  cnbctv18: (headline) => `https://www.cnbctv18.com/search/?q=${encodeURIComponent(headline)}`,
  cnbc: (headline) => `https://www.cnbc.com/search/?query=${encodeURIComponent(headline)}`,
  moneycontrol: (headline) => `https://www.moneycontrol.com/news/tags/${toSlug(headline)}.html`,
  finnhub: (headline) => `https://news.google.com/search?q=${encodeURIComponent(headline)}`,
  newsapi: (headline) => `https://news.google.com/search?q=${encodeURIComponent(headline)}`,
  newsdata: (headline) => `https://news.google.com/search?q=${encodeURIComponent(headline)}`
};

const isValidHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
};

const buildFallbackArticleUrl = (headline = 'market news', source = 'news') => {
  const normalizedSource = String(source || '').toLowerCase().trim();
  const builder = sourceFallbackUrlBuilders[normalizedSource];
  if (builder) return builder(headline || 'market news');
  return `https://news.google.com/search?q=${encodeURIComponent(headline || 'market news')}`;
};

const resolveArticleUrl = (url, headline, source) => {
  if (isValidHttpUrl(url)) return url;
  return buildFallbackArticleUrl(headline, source);
};

const extractXmlTag = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
  const raw = match?.[1] || '';
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i)?.[1] || raw;
  return decodeXmlEntities(stripHtml(cdata));
};

const parseRssItems = (xml) => {
  const itemBlocks = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];

  return itemBlocks.map((block, index) => {
    const title = extractXmlTag(block, 'title');
    const summary = extractXmlTag(block, 'description');
    const linkTag = extractXmlTag(block, 'link');
    const guidTag = extractXmlTag(block, 'guid');
    const url = linkTag || guidTag;

    return {
      id: `rss-${Date.now()}-${index}`,
      headline: title || fallbackHeadlineFromSummary(summary),
      summary,
      url,
      datetime: toIsoDate(extractXmlTag(block, 'pubDate'))
    };
  });
};

const normalizeArticle = (article, category = 'general', index = 0) => {
  const summary = normalizeWhitespace(article.summary || '');
  const headline = isGenericHeadline(article.headline) ? fallbackHeadlineFromSummary(summary) : normalizeWhitespace(article.headline || '');
  const source = normalizeWhitespace(article.source || 'Market Feed') || 'Market Feed';
  const relevanceScore = Number(article.relevanceScore);
  const confidenceScore = Number(article.confidenceScore);

  if (!headline) return null;

  return {
    id: article.id || `news-${category}-${Date.now()}-${index}`,
    headline,
    summary,
    source,
    url: resolveArticleUrl(article.url, headline, source),
    image: article.image || '',
    datetime: toIsoDate(article.datetime),
    category,
    relevanceScore: Number.isFinite(relevanceScore) ? Number(relevanceScore.toFixed(2)) : null,
    confidenceScore: Number.isFinite(confidenceScore) ? Math.max(0, Math.min(100, Math.round(confidenceScore))) : null,
    confidenceLabel: article.confidenceLabel || null
  };
};

const applyCategoryFilter = (articles, category = 'general') => {
  const normalizedCategory = String(category || 'general').toLowerCase();
  const categoryKeywords = CATEGORY_KEYWORDS[normalizedCategory];
  if (!categoryKeywords || !categoryKeywords.length) return articles;

  return articles.filter((article) => {
    const text = `${article.headline || ''} ${article.summary || ''}`.toLowerCase();
    return categoryKeywords.some((word) => text.includes(word));
  });
};

const scoreArticle = (article, category = 'general', queryTokens = []) => {
  const text = `${article.headline || ''} ${article.summary || ''}`.toLowerCase();
  const source = String(article.source || '').toLowerCase();
  const now = Date.now();
  const published = Date.parse(article.datetime || '') || now;
  const ageHours = Math.max(0, (now - published) / (1000 * 60 * 60));

  let score = 0;

  if (INDIA_SOURCE_HINTS.some((hint) => source.includes(hint))) score += 4;
  if (text.includes('india') || text.includes('nse') || text.includes('bse') || text.includes('nifty') || text.includes('sensex')) score += 3;

  const categoryKeywords = CATEGORY_KEYWORDS[String(category || '').toLowerCase()] || [];
  score += categoryKeywords.filter((word) => text.includes(word)).length * 2;

  if (queryTokens.length) {
    score += queryTokens.filter((token) => text.includes(token)).length * 2.6;
  }

  if (ageHours <= 6) score += 2;
  else if (ageHours <= 24) score += 1;

  if (isGenericHeadline(article.headline)) score -= 6;

  return score;
};

const mapScoreToConfidence = (score) => {
  const normalized = Math.max(0, Math.min(100, Math.round((score + 6) * 6)));

  if (normalized >= 75) {
    return { score: normalized, label: 'High' };
  }

  if (normalized >= 55) {
    return { score: normalized, label: 'Medium' };
  }

  return { score: normalized, label: 'Low' };
};

const dedupeArticles = (articles) => {
  const seen = new Set();
  const deduped = [];

  for (const article of articles) {
    if (!article) continue;
    const key = String(article.url || '').trim().toLowerCase()
      || `${String(article.source || '').toLowerCase()}|${String(article.headline || '').toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(article);
  }

  return deduped;
};

const enrichWithSentiment = async (articles, category = 'general') => {
  return Promise.all(articles.map(async (article, index) => {
    const normalized = normalizeArticle(article, category, index);
    if (!normalized) return null;

    return {
      ...normalized,
      sentiment: await analyzeSentiment(`${normalized.headline || ''} ${normalized.summary || ''}`)
    };
  })).then((items) => items.filter(Boolean));
};

const fetchFinnhubMarketNews = async (category = 'general') => {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return [];

  const finnhubCategory = ['general', 'forex', 'crypto', 'merger'].includes(category) ? category : 'general';

  try {
    const response = await axios.get('https://finnhub.io/api/v1/news', {
      timeout: REQUEST_TIMEOUT,
      params: { category: finnhubCategory, token: apiKey }
    });

    const feed = Array.isArray(response.data) ? response.data : [];
    return feed.slice(0, 40).map((item, index) => ({
      id: item.id || `finnhub-${category}-${item.datetime || Date.now()}-${index}`,
      headline: item.headline || 'Market update',
      summary: item.summary || '',
      source: item.source || 'Finnhub',
      url: item.url,
      image: item.image || '',
      datetime: toIsoFromUnixSeconds(item.datetime)
    }));
  } catch (err) {
    return [];
  }
};

const fetchNewsApiMarketNews = async (category = 'general', queryOverride = '') => {
  const { newsApiKey } = getNewsProviderKeys();
  if (!newsApiKey) return [];

  const query = normalizeWhitespace(queryOverride || CATEGORY_QUERY_MAP[category] || CATEGORY_QUERY_MAP.general);

  try {
    const response = await axios.get('https://newsapi.org/v2/everything', {
      timeout: REQUEST_TIMEOUT,
      params: {
        apiKey: newsApiKey,
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 35
      }
    });

    const articles = Array.isArray(response.data?.articles) ? response.data.articles : [];
    return articles.map((item, index) => ({
      id: `newsapi-${category}-${Date.now()}-${index}`,
      headline: item.title || 'Market update',
      summary: stripHtml(item.description || item.content || ''),
      source: item.source?.name || 'NewsAPI',
      url: item.url,
      image: item.urlToImage || '',
      datetime: toIsoDate(item.publishedAt)
    }));
  } catch (err) {
    return [];
  }
};

const fetchNewsDataMarketNews = async (category = 'general', queryOverride = '') => {
  const { newsDataKey } = getNewsProviderKeys();
  if (!newsDataKey) return [];

  const query = normalizeWhitespace(queryOverride || CATEGORY_QUERY_MAP[category] || CATEGORY_QUERY_MAP.general);

  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      timeout: REQUEST_TIMEOUT,
      params: {
        apikey: newsDataKey,
        language: 'en',
        category: 'business',
        q: query,
        size: 35
      }
    });

    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    return results.map((item, index) => ({
      id: `newsdata-${category}-${item?.article_id || Date.now()}-${index}`,
      headline: stripHtml(item?.title || 'Market update'),
      summary: stripHtml(item?.description || item?.content || ''),
      source: item?.source_id || 'NewsData',
      url: item?.link,
      image: item?.image_url || '',
      datetime: toIsoDate(item?.pubDate)
    }));
  } catch (err) {
    return [];
  }
};

const fetchRssMarketNews = async (category = 'general') => {
  const responses = await Promise.allSettled(INDIA_RSS_FEEDS.map((feed) =>
    axios.get(feed.url, {
      timeout: REQUEST_TIMEOUT,
      responseType: 'text'
    }).then((res) => ({ feed, xml: res.data }))
  ));

  const articles = [];

  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;
    const parsed = parseRssItems(response.value.xml).slice(0, 40);
    for (const item of parsed) {
      articles.push({
        ...item,
        source: response.value.feed.source,
        url: resolveArticleUrl(item.url, item.headline, response.value.feed.source)
      });
    }
  }

  return applyCategoryFilter(articles, category);
};

const fetchFinnhubStockNews = async (symbol) => {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return [];

  try {
    const from = new Date();
    from.setDate(from.getDate() - 10);

    const response = await axios.get('https://finnhub.io/api/v1/company-news', {
      timeout: REQUEST_TIMEOUT,
      params: {
        symbol,
        from: from.toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        token: apiKey
      }
    });

    const feed = Array.isArray(response.data) ? response.data : [];
    return feed.slice(0, 25).map((item, index) => ({
      id: item.id || `finnhub-${symbol}-${item.datetime || Date.now()}-${index}`,
      headline: item.headline || `${symbol.toUpperCase()} update`,
      summary: item.summary || '',
      source: item.source || 'Finnhub',
      url: item.url,
      image: item.image || '',
      datetime: toIsoFromUnixSeconds(item.datetime)
    }));
  } catch (err) {
    return [];
  }
};

const sortAndCurate = (articles, category = 'general', limit = 20, queryTokens = []) => {
  const filtered = applyCategoryFilter(articles, category);
  const ranked = filtered
    .map((article) => {
      const score = scoreArticle(article, category, queryTokens);
      const confidence = mapScoreToConfidence(score);
      return {
        article: {
          ...article,
          relevanceScore: Number(score.toFixed(2)),
          confidenceScore: confidence.score,
          confidenceLabel: confidence.label
        },
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.article);

  return ranked.slice(0, limit);
};

const collectMarketArticles = async (category = 'general', queryOverride = '') => {
  const [rss, finnhub, newsApi, newsData] = await Promise.all([
    fetchRssMarketNews(category),
    fetchFinnhubMarketNews(category),
    fetchNewsApiMarketNews(category, queryOverride),
    fetchNewsDataMarketNews(category, queryOverride)
  ]);

  return dedupeArticles([...rss, ...finnhub, ...newsApi, ...newsData]);
};

const getMarketNews = async (category = 'general') => {
  const normalizedCategory = String(category || 'general').toLowerCase();
  const cacheKey = `news_market_${normalizedCategory}`;
  const cached = await cache.news.get(cacheKey);
  if (cached) return cached;

  const merged = await collectMarketArticles(normalizedCategory);
  const curated = sortAndCurate(merged, normalizedCategory, 20);

  if (!curated.length) {
    return getMockNews('', normalizedCategory);
  }

  const enriched = await enrichWithSentiment(curated, normalizedCategory);
  await cache.news.set(cacheKey, enriched);
  return enriched;
};

const searchNews = async (query, category = 'india', limit = 12, options = {}) => {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) return [];

  const normalizedCategory = String(category || 'india').toLowerCase();
  const skipCache = Boolean(options.skipCache);
  const cacheKey = `news_search_${normalizedCategory}_${normalizedQuery.toLowerCase()}`;
  if (!skipCache) {
    const cached = await cache.news.get(cacheKey);
    if (cached) return cached;
  }

  const queryTokens = tokenize(normalizedQuery);
  const merged = await collectMarketArticles(normalizedCategory, normalizedQuery);

  const filtered = merged.filter((article) => {
    const text = `${article.headline || ''} ${article.summary || ''}`.toLowerCase();
    return queryTokens.some((token) => text.includes(token));
  });

  const curated = sortAndCurate(filtered.length ? filtered : merged, normalizedCategory, limit, queryTokens);
  const enriched = curated.length ? await enrichWithSentiment(curated, normalizedCategory) : await getMockNews(normalizedQuery, normalizedCategory);

  if (!skipCache) {
    await cache.news.set(cacheKey, enriched);
  }
  return enriched;
};

const getStockNewsInternal = async (symbol, options = {}) => {
  const cleanSymbol = String(symbol || '').trim();
  const skipCache = Boolean(options.skipCache);
  const cacheKey = `news_stock_${cleanSymbol}`;
  if (!skipCache) {
    const cached = await cache.news.get(cacheKey);
    if (cached) return cached;
  }

  const baseSymbol = cleanSymbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
  let quoteName = '';

  try {
    const quote = await getStockQuote(cleanSymbol);
    quoteName = normalizeWhitespace(quote?.name || '');
  } catch (err) {
    quoteName = '';
  }

  const queryTerms = [
    baseSymbol,
    quoteName,
    `${baseSymbol} share`,
    `${quoteName} stock`,
    `${quoteName} nse bse india`
  ].filter(Boolean).join(' ');

  const queryTokens = getStockSpecificTokens(baseSymbol, quoteName);
  const strongEntityTokens = queryTokens.filter((token) => token.length >= 4);

  const [finnhub, searched] = await Promise.all([
    fetchFinnhubStockNews(cleanSymbol),
    searchNews(queryTerms, 'india', 16, { skipCache: true })
  ]);

  const merged = dedupeArticles([...finnhub, ...searched]);
  const filtered = merged.filter((article) => {
    const text = `${article.headline || ''} ${article.summary || ''}`.toLowerCase();
    const directSymbolMention = text.includes(baseSymbol.toLowerCase());
    const tokenHits = queryTokens.filter((token) => text.includes(token)).length;
    return directSymbolMention || tokenHits >= 2;
  });

  const strictEntityMatches = merged.filter((article) => {
    const text = `${article.headline || ''} ${article.summary || ''}`.toLowerCase();
    if (text.includes(baseSymbol.toLowerCase())) return true;
    return strongEntityTokens.some((token) => text.includes(token));
  });

  const baseSet = strictEntityMatches.length ? strictEntityMatches : filtered;
  if (!baseSet.length) {
    return getMockNews(baseSymbol, 'india');
  }

  const curated = sortAndCurate(baseSet, 'india', 10, queryTokens);
  if (!curated.length) {
    return getMockNews(baseSymbol, 'india');
  }

  const enriched = await enrichWithSentiment(curated, 'india');
  if (!skipCache) {
    await cache.news.set(cacheKey, enriched);
  }
  return enriched;
};

const getStockNews = async (symbol) => getStockNewsInternal(symbol, { skipCache: false });
const getStockNewsFresh = async (symbol) => getStockNewsInternal(symbol, { skipCache: true });

const getMockNews = async (symbol = '', category = 'general') => {
  const symbolPrefix = symbol ? `${String(symbol).toUpperCase()} ` : '';

  const templates = {
    general: [
      { source: 'Moneycontrol', headline: `${symbolPrefix}Nifty and Sensex close higher as banking and IT lead gains`, summary: 'Indian benchmarks ended in the green with broad-based buying interest in large-cap counters.' },
      { source: 'Economic Times', headline: 'RBI commentary keeps bond and equity traders focused on inflation path', summary: 'Markets tracked policy commentary and liquidity cues as participants reassessed near-term rate expectations.' },
      { source: 'CNBC TV18', headline: 'Midcap momentum cools while quality large-caps see defensive inflows', summary: 'Portfolio rotation favored established names as traders looked for earnings visibility.' },
      { source: 'Business Standard', headline: 'Rupee movement and crude trend shape sector-level positioning', summary: 'Auto, paints, and OMC counters reacted to commodity and currency swings.' },
      { source: 'Mint', headline: 'FII and DII flows remain key directional signals for weekly trade setup', summary: 'Participants continue to track institutional positioning for short-term conviction.' }
    ],
    merger: [
      { source: 'Economic Times', headline: 'India Inc watches fresh merger activity in financial and industrial sectors', summary: 'Analysts expect deal announcements to influence re-rating in select midcap names.' },
      { source: 'Moneycontrol', headline: 'Strategic stake sale talks trigger volatility in target company shares', summary: 'Street monitors valuation premiums and regulatory clearances for closure timelines.' },
      { source: 'CNBC TV18', headline: 'Acquisition pipeline expands as firms seek scale and distribution edge', summary: 'Management commentary highlights synergy and margin expansion potential.' }
    ],
    fno: [
      { source: 'Moneycontrol', headline: 'Nifty weekly expiry sees higher options activity near key resistance', summary: 'Traders tracked open-interest build-up in index calls and puts to map short-term range.' },
      { source: 'Economic Times', headline: 'BankNifty futures basis narrows ahead of policy-sensitive sessions', summary: 'Volatility remained elevated as participants reduced leveraged overnight exposure.' },
      { source: 'CNBC TV18', headline: 'Sectoral futures show selective long build-up after earnings updates', summary: 'Derivatives data indicated stock-specific positioning in banking and infra names.' }
    ],
    bonds: [
      { source: 'Economic Times', headline: 'India 10-year bond yield remains in focus as RBI liquidity cues evolve', summary: 'Debt traders watched auction demand and inflation expectations for next move in yields.' },
      { source: 'Mint', headline: 'Government securities attract defensive allocation amid equity volatility', summary: 'Balanced portfolios tilted toward duration as risk appetite moderated.' },
      { source: 'Business Standard', headline: 'Corporate bond spreads stable despite mixed macro signals', summary: 'Credit markets showed resilience with selective demand in high-grade issuances.' }
    ]
  };

  const selected = templates[category] || templates.general;

  return Promise.all(selected.map(async (item, index) => ({
    id: `mock-${category}-${index + 1}`,
    headline: item.headline,
    summary: item.summary,
    source: item.source,
    url: resolveArticleUrl('', item.headline, item.source),
    image: `https://picsum.photos/seed/news-${category}-${index + 1}/640/360`,
    datetime: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    category,
    relevanceScore: 6,
    confidenceScore: 62,
    confidenceLabel: 'Medium',
    sentiment: await analyzeSentiment(`${item.headline} ${item.summary}`)
  })));
};

const getNewsProviderStatus = () => {
  const { newsApiKey, newsDataKey } = getNewsProviderKeys();
  const keySources = getNewsProviderKeySources();

  return {
    rss: {
      configured: true,
      feeds: INDIA_RSS_FEEDS.map((feed) => feed.source)
    },
    finnhub: {
      configured: Boolean(getFinnhubApiKey()),
      keySource: keySources.finnhub
    },
    newsApi: {
      configured: Boolean(newsApiKey),
      keySource: keySources.newsApi
    },
    newsData: {
      configured: Boolean(newsDataKey),
      keySource: keySources.newsData
    }
  };
};

module.exports = {
  getMarketNews,
  getStockNews,
  getStockNewsFresh,
  searchNews,
  analyzeSentiment,
  getNewsProviderStatus
};