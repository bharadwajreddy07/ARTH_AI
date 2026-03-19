const OpenAI = require('openai');
const { getStockQuote, getDualExchangeQuotes, getHistoricalData, getStockDeepDetails } = require('./stockService');
const { getStockNewsFresh } = require('./newsService');
const { getMFDetails } = require('./mfService');
const { getSentimentProviderStatus } = require('./sentimentService');
const { retrieveRagContext, formatRagContext, getRagStatus } = require('./ragService');

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_HF_ROUTER_MODEL = 'moonshotai/Kimi-K2-Instruct-0905';
const HF_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

let openai = null;
let lastOpenAIError = null;
let cachedApiKey = '';
let cachedBaseURL = '';

const getRuntimeAIConfig = () => {
  const groqApiKey = String(process.env.GROQ_API_KEY || '').trim();
  const groqModel = String(process.env.GROQ_MODEL || '').trim();
  const openaiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const openApiKeyAlias = String(process.env.OPEN_API_KEY || '').trim();
  const openAiKeyAlias = String(process.env.OPEN_AI_KEY || '').trim();
  const openAiLegacyKey = String(process.env.OPENAI_KEY || '').trim();
  const hfToken = String(process.env.HF_TOKEN || '').trim();
  const hfApiKey = String(process.env.HF_API_KEY || '').trim();
  const hfLegacyKey = String(process.env.HUGGINGFACE_API_KEY || '').trim();
  const configuredBaseURL = String(process.env.OPENAI_BASE_URL || '').trim();

  const openAIKey = openaiApiKey || openApiKeyAlias || openAiKeyAlias || openAiLegacyKey;
  const huggingFaceKey = hfToken || hfApiKey || hfLegacyKey;

  const configuredModel = String(process.env.OPENAI_MODEL || '').trim();
  if (groqApiKey) {
    return {
      apiKey: groqApiKey,
      keySource: 'GROQ_API_KEY',
      baseURL: configuredBaseURL || GROQ_BASE_URL,
      model: groqModel || configuredModel || DEFAULT_GROQ_MODEL,
      provider: 'groq',
      isHuggingFaceRouter: false
    };
  }

  const openAIKeySource = openaiApiKey
    ? 'OPENAI_API_KEY'
    : openApiKeyAlias
      ? 'OPEN_API_KEY'
      : openAiKeyAlias
        ? 'OPEN_AI_KEY'
        : openAiLegacyKey
          ? 'OPENAI_KEY'
          : null;

  const huggingFaceKeySource = hfToken
    ? 'HF_TOKEN'
    : hfApiKey
      ? 'HF_API_KEY'
      : hfLegacyKey
        ? 'HUGGINGFACE_API_KEY'
        : null;

  // Auto-route to Hugging Face router when only HF credentials exist.
  const isHuggingFaceRouter = configuredBaseURL.startsWith(HF_ROUTER_BASE_URL)
    || (!openAIKey && Boolean(huggingFaceKey));

  const baseURL = isHuggingFaceRouter
    ? (configuredBaseURL || HF_ROUTER_BASE_URL)
    : configuredBaseURL;

  const apiKey = isHuggingFaceRouter ? huggingFaceKey : openAIKey;
  const keySource = isHuggingFaceRouter ? huggingFaceKeySource : openAIKeySource;
  const provider = isHuggingFaceRouter ? 'huggingface-router' : 'openai';

  const model = configuredModel || (isHuggingFaceRouter ? DEFAULT_HF_ROUTER_MODEL : DEFAULT_OPENAI_MODEL);

  return {
    apiKey,
    keySource,
    baseURL,
    model,
    provider,
    isHuggingFaceRouter
  };
};

const toErrorMessage = (err) => {
  if (!err) return 'Unknown OpenAI error';
  const status = err.status || err.code || err.name;
  const message = err.message || String(err);
  return status ? `${status}: ${message}` : message;
};

const setOpenAIError = (err) => {
  lastOpenAIError = toErrorMessage(err);
};

const clearOpenAIError = () => {
  lastOpenAIError = null;
};

const getOpenAIClient = () => {
  const config = getRuntimeAIConfig();
  if (!config.apiKey) return null;

  const needsRefresh = !openai || cachedApiKey !== config.apiKey || cachedBaseURL !== config.baseURL;

  if (needsRefresh) {
    openai = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {})
    });
    cachedApiKey = config.apiKey;
    cachedBaseURL = config.baseURL;
  }

  return openai;
};

const FINANCIAL_KNOWLEDGE = `
You are Arth, an intelligent financial co-pilot for Indian retail investors.

Guidelines:
- Explain complex terms in plain language.
- Present both opportunities and risks.
- Use Indian market context (NSE, BSE, SEBI, RBI, FII/DII).
- Never provide absolute buy/sell instructions.
- Always end with: "This is educational content, not financial advice."

When data is uncertain or missing:
- Be explicit that data may be delayed or incomplete.
- Suggest what users should verify next.
`;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const averageTail = (values, count) => {
  const clean = (Array.isArray(values) ? values : []).map((v) => Number(v)).filter(Number.isFinite);
  if (!clean.length) return 0;
  const tail = clean.slice(-Math.min(count, clean.length));
  if (!tail.length) return 0;
  return tail.reduce((sum, value) => sum + value, 0) / tail.length;
};

const buildDataContextText = ({ symbol, quote, news }) => {
  if (!symbol || !quote) return '';

  const sentimentSummary = Array.isArray(news)
    ? news.slice(0, 3).map((item) => `${item.headline || 'headline'} (${item.sentiment?.label || 'neutral'})`).join('; ')
    : '';

  return `Live context for ${symbol}:
Price: INR ${toNumber(quote.price)}
Change: ${toNumber(quote.change)} (${toNumber(quote.changePercent)}%)
P/E: ${toNumber(quote.pe, 0)}
52w range: INR ${toNumber(quote.low52w)} - INR ${toNumber(quote.high52w)}
Market cap: INR ${toNumber(quote.marketCap)}
Recent sentiment: ${sentimentSummary || 'Not available'}`;
};

const createCompletion = async (client, messages, options = {}) => {
  const { model } = getRuntimeAIConfig();

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.max_tokens ?? 700
    });

    clearOpenAIError();
    return response;
  } catch (err) {
    setOpenAIError(err);
    throw err;
  }
};

const getFallbackReason = () => lastOpenAIError || 'AI key missing or unavailable (set GROQ_API_KEY, OPENAI_API_KEY, or HF_TOKEN with OPENAI_BASE_URL=https://router.huggingface.co/v1)';

const calculateReturnPct = (history, days) => {
  const points = Array.isArray(history) ? history.slice(0, days + 1) : [];
  if (points.length < 2) return null;

  const latest = toNumber(points[0]?.nav);
  const past = toNumber(points[points.length - 1]?.nav);
  if (!latest || !past) return null;
  return Number((((latest - past) / past) * 100).toFixed(2));
};

const analyzeMutualFund = async (schemeCode) => {
  let details;
  try {
    details = await getMFDetails(schemeCode);
  } catch (err) {
    return {
      schemeCode,
      analysis: `Unable to fetch mutual fund details for ${schemeCode}. Please verify the scheme code and try again.`,
      isFallback: true,
      fallbackReason: 'Unable to load mutual fund data'
    };
  }

  const history = Array.isArray(details?.historicalData) ? details.historicalData : [];
  const performance = {
    return1W: calculateReturnPct(history, 7),
    return1M: calculateReturnPct(history, 30),
    return3M: calculateReturnPct(history, 90)
  };

  const client = getOpenAIClient();
  const runtimeContext = {
    schemeCode,
    mutualFund: {
      schemeName: details.schemeName,
      nav: details.nav,
      changePercent: details.changePercent,
      category: details.schemeCategory,
      fundHouse: details.fundHouse,
      performance
    }
  };

  const ragChunks = await retrieveRagContext({
    query: `Mutual fund analysis for ${details.schemeName || schemeCode}`,
    runtimeContext,
    client
  });
  const ragContext = formatRagContext(ragChunks);

  if (!client) {
    return {
      schemeCode,
      schemeName: details.schemeName,
      nav: details.nav,
      changePercent: details.changePercent,
      performance,
      analysis: `Fund overview for ${details.schemeName}:\n- Category: ${details.schemeCategory || 'N/A'}\n- Current NAV: INR ${toNumber(details.nav)}\n- 1M return: ${performance.return1M ?? 'N/A'}%\n- 3M return: ${performance.return3M ?? 'N/A'}%\n\nUse rolling consistency, drawdown behavior, and category peers before decision-making. This is educational content, not financial advice.`,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }

  const prompt = `Analyze this mutual fund for Indian retail investors:\nScheme: ${details.schemeName}\nFund house: ${details.fundHouse}\nCategory: ${details.schemeCategory}\nCurrent NAV: INR ${toNumber(details.nav)}\nDaily change: ${toNumber(details.changePercent)}%\n1W return: ${performance.return1W ?? 'N/A'}%\n1M return: ${performance.return1M ?? 'N/A'}%\n3M return: ${performance.return3M ?? 'N/A'}%\n\nProvide:\n1. Trend interpretation\n2. Risk cues and what to verify\n3. Suitability by time horizon (short/medium/long)\n4. Practical checklist before investing\nKeep it concise and educational.`;

  try {
    const response = await createCompletion(client, [
      { role: 'system', content: `${FINANCIAL_KNOWLEDGE}\n\nRetrieved context:\n${ragContext}` },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.5,
      max_tokens: 480
    });

    return {
      schemeCode,
      schemeName: details.schemeName,
      nav: details.nav,
      changePercent: details.changePercent,
      performance,
      analysis: response.choices[0].message.content,
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  } catch (err) {
    return {
      schemeCode,
      schemeName: details.schemeName,
      nav: details.nav,
      changePercent: details.changePercent,
      performance,
      analysis: `Could not run AI mutual fund analysis at the moment. Recent NAV is INR ${toNumber(details.nav)} and category is ${details.schemeCategory || 'N/A'}. This is educational content, not financial advice.`,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }
};

const chat = async (userMessage, context = {}) => {
  const client = getOpenAIClient();

  let runtimeContext = {};
  let dataContext = '';

  if (context.symbol) {
    try {
      const [deep, quote, history, news] = await Promise.all([
        getStockDeepDetails(context.symbol),
        getStockQuote(context.symbol),
        getHistoricalData(context.symbol, '3mo'),        getStockNewsFresh(context.symbol)
      ]);

      runtimeContext = {
        symbol: context.symbol,
        deep,
        quote,
        history,
        news
      };

      const deepTech = deep?.technicals || {};
      const deepFund = deep?.fundamentals || {};
      const shareholding = Array.isArray(deep?.shareholding?.distribution)
        ? deep.shareholding.distribution.map((item) => `${item.label}: ${item.value}%`).join('; ')
        : 'Not available';

      dataContext = `${buildDataContextText({ symbol: context.symbol, quote, news })}
Technicals: RSI ${toNumber(deepTech.rsi14)} | MACD ${toNumber(deepTech.macd?.macd)} | Support ${toNumber(deepTech.support)} | Resistance ${toNumber(deepTech.resistance)}
Fundamentals: PE ${toNumber(deepFund.pe)} | Industry PE ${toNumber(deepFund.industryPe)} | ROE ${toNumber(deepFund.roe)} | Debt/Equity ${toNumber(deepFund.debtToEquity)}
Shareholding: ${shareholding}`;
    } catch (err) {
      runtimeContext = { symbol: context.symbol };
    }
  }

  const ragChunks = await retrieveRagContext({
    query: userMessage,
    runtimeContext,
    client
  });
  const ragContext = formatRagContext(ragChunks);

  if (!client) {
    return {
      message: getFallbackResponse(userMessage),
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: {
        enabled: true,
        sources: ragChunks.map((chunk) => chunk.source)
      }
    };
  }

  try {
    const systemPrompt = [
      FINANCIAL_KNOWLEDGE,
      ragContext ? `Retrieved context:\n${ragContext}` : '',
      dataContext ? `\n${dataContext}` : ''
    ].filter(Boolean).join('\n\n');

    const response = await createCompletion(client, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], {
      temperature: 0.6,
      max_tokens: 800
    });

    return {
      message: response.choices[0].message.content,
      usage: response.usage,
      model: response.model,
      rag: {
        enabled: true,
        sources: ragChunks.map((chunk) => chunk.source)
      }
    };
  } catch (err) {
    return {
      message: getFallbackResponse(userMessage),
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: {
        enabled: true,
        sources: ragChunks.map((chunk) => chunk.source)
      }
    };
  }
};

const analyzeStock = async (symbol) => {
  let quote = null;
  let dualQuotes = null;
  let history = [];
  let news = [];
  let deep = null;

  try {
    [deep, dualQuotes, history, news] = await Promise.all([
      getStockDeepDetails(symbol),
      getDualExchangeQuotes(symbol).catch(() => null),
      getHistoricalData(symbol, '3mo'),
      getStockNewsFresh(symbol)
    ]);
    quote = deep?.quote || null;
  } catch (err) {
    return {
      symbol,
      analysis: getFallbackStockAnalysis(symbol),
      isFallback: true,
      fallbackReason: 'Unable to load live market context'
    };
  }

  const prices = history.map((item) => item.close).filter(Boolean);
  const sma20 = averageTail(prices, 20);
  const sma50 = averageTail(prices, 50);
  const technicals = deep?.technicals || { sma20, sma50, trend: quote?.price > sma20 ? 'above_sma20' : 'below_sma20' };

  const fundamentals = deep?.fundamentals || {};
  const shareholdingData = deep?.shareholding || {};
  const shareholding = Array.isArray(shareholdingData?.distribution) ? shareholdingData.distribution : [];
  const financialPoints = Array.isArray(deep?.financials?.points) ? deep.financials.points : [];
  const financials = deep?.financials || {};
  const relatedStocks = Array.isArray(deep?.relatedStocks) ? deep.relatedStocks : [];

  const getHoldingValue = (labelQuery) => {
    const item = shareholding.find((entry) => String(entry.label || '').toLowerCase().includes(labelQuery));
    return item?.value;
  };

  const quickSummary = [
    `Price ${toNumber(quote?.price)} INR (${toNumber(quote?.changePercent)}%) with ${technicals?.trend || 'mixed'} trend setup.`,
    `Technical levels: RSI ${toNumber(technicals?.rsi14)}, support ${toNumber(technicals?.support)}, resistance ${toNumber(technicals?.resistance)}.`,
    `Valuation: P/E ${toNumber(fundamentals?.pe)} vs industry ${toNumber(fundamentals?.industryPe)}; ROE ${toNumber(fundamentals?.roe)}%, debt/equity ${toNumber(fundamentals?.debtToEquity)}.`,
    `Shareholding (${shareholdingData?.source || 'default source'}): Promoters ${getHoldingValue('promoter') ?? 'N/A'}%, FIIs ${getHoldingValue('fii') ?? 'N/A'}%, DIIs ${getHoldingValue('dii') ?? 'N/A'}%, Public ${getHoldingValue('public') ?? 'N/A'}%.`,
    financials?.latestQuarterly
      ? `Latest quarter (${financials.latestQuarterly.period}): Revenue ${toNumber(financials.latestQuarterly.revenue)}, Profit ${toNumber(financials.latestQuarterly.profit)}.`
      : financials?.latestYearly
        ? `Latest year (${financials.latestYearly.period}): Revenue ${toNumber(financials.latestYearly.revenue)}, Profit ${toNumber(financials.latestYearly.profit)}.`
        : 'Financial trend series is limited for this symbol.',
    `${news.filter((item) => toNumber(item.confidenceScore) >= 75).length} high-confidence and ${news.filter((item) => toNumber(item.confidenceScore) >= 55 && toNumber(item.confidenceScore) < 75).length} medium-confidence related headlines in latest web pull.`
  ];

  const shareholdingText = shareholding.length
    ? shareholding.map((item) => `${item.label}: ${item.value}%`).join('; ')
    : 'Not available';

  const financialTrendText = financialPoints.length
    ? financialPoints.slice(-3).map((item) => `${item.period}: Revenue ${toNumber(item.revenue)}, Profit ${toNumber(item.profit)}`).join(' | ')
    : 'Not available';

  const peersText = relatedStocks.length
    ? relatedStocks.map((item) => `${item.symbol} (${toNumber(item.changePercent)}%)`).join(', ')
    : 'Not available';

  const newsContext = news.slice(0, 6).map((item, index) => {
    return `${index + 1}. ${item.headline} | ${item.source} | ${item.datetime} | confidence ${item.confidenceLabel || 'Unknown'} (${toNumber(item.confidenceScore)})`;
  }).join('\n');

  const client = getOpenAIClient();
  const runtimeContext = {
    symbol,
    quote,
    dualQuotes,
    history,
    news,
    deep
  };

  const ragChunks = await retrieveRagContext({
    query: `Deep realtime analysis for ${symbol} using fresh internet articles, technicals, fundamentals, and shareholding`,
    runtimeContext,
    client
  });
  const ragContext = formatRagContext(ragChunks);

  if (!client) {
    const fallbackAnalysis = buildRuleBasedDeepAnalysis({
      symbol,
      quote,
      technicals,
      fundamentals,
      shareholding,
      news,
      relatedStocks
    });

    return {
      symbol,
      analysis: fallbackAnalysis,
      summary: quickSummary,
      technicals,
      fundamentals,
      shareholding,
      financials,
      quote,
      dualQuotes,
      news: news.slice(0, 5),
      relatedStocks,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }

  const prompt = `Create a deep realtime Indian stock analysis for ${symbol}.

Market snapshot:
- Price: INR ${toNumber(quote.price)} | Daily change: ${toNumber(quote.changePercent)}%
- 52W range: INR ${toNumber(quote.low52w)} - INR ${toNumber(quote.high52w)}
- NSE quote: ${dualQuotes?.nse ? `INR ${toNumber(dualQuotes.nse.price)} (${toNumber(dualQuotes.nse.changePercent)}%)` : 'Not available'}
- BSE quote: ${dualQuotes?.bse ? `INR ${toNumber(dualQuotes.bse.price)} (${toNumber(dualQuotes.bse.changePercent)}%)` : 'Not available'}

Technicals:
- SMA20 ${toNumber(technicals.sma20)} | SMA50 ${toNumber(technicals.sma50)}
- EMA20 ${toNumber(technicals.ema20)} | EMA50 ${toNumber(technicals.ema50)}
- RSI14 ${toNumber(technicals.rsi14)}
- MACD ${toNumber(technicals.macd?.macd)} | Signal ${toNumber(technicals.macd?.signal)}
- ATR14 ${toNumber(technicals.atr14)} | 30D vol ${toNumber(technicals.volatility30d)}%
- Support ${toNumber(technicals.support)} | Resistance ${toNumber(technicals.resistance)}

Fundamentals:
- Market Cap ${toNumber(fundamentals.marketCap)} | PE ${toNumber(fundamentals.pe)} | Industry PE ${toNumber(fundamentals.industryPe)}
- EPS ${toNumber(fundamentals.eps)} | ROE ${toNumber(fundamentals.roe)}% | Debt/Equity ${toNumber(fundamentals.debtToEquity)}

Shareholding pattern:
${shareholdingText}
Source: ${shareholdingData?.source || 'Not specified'}

Financial trend:
${financialTrendText}

Related stocks:
${peersText}

Fresh internet article context:
${newsContext || 'No related headlines available'}

Return sections:
1) Executive summary (2 lines)
2) Technical setup for next 1-3 sessions with bull/bear trigger and invalidation
3) Fundamental and valuation context vs industry
4) Shareholding and ownership quality read
5) News + sentiment impact
6) F&O watchpoints (OI/IV/strike behavior conceptually)
7) Risk checklist and what to monitor next
8) Add a compact 6-bullet quick summary at the end

Keep language practical for Indian retail investors and stay educational.`;

  try {
    const response = await createCompletion(client, [
      { role: 'system', content: `${FINANCIAL_KNOWLEDGE}\n\nRetrieved context:\n${ragContext}` },
      { role: 'user', content: prompt }
    ], {
      max_tokens: 900,
      temperature: 0.45
    });

    return {
      symbol,
      analysis: response.choices[0].message.content,
      summary: quickSummary,
      technicals,
      fundamentals,
      shareholding,
      financials,
      quote,
      dualQuotes,
      news: news.slice(0, 5),
      relatedStocks,
      rag: {
        enabled: true,
        sources: ragChunks.map((chunk) => chunk.source)
      }
    };
  } catch (err) {
    const fallbackAnalysis = buildRuleBasedDeepAnalysis({
      symbol,
      quote,
      technicals,
      fundamentals,
      shareholding,
      news,
      relatedStocks
    });

    return {
      symbol,
      analysis: fallbackAnalysis,
      summary: quickSummary,
      technicals,
      fundamentals,
      shareholding,
      financials,
      quote,
      dualQuotes,
      news: news.slice(0, 5),
      relatedStocks,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: {
        enabled: true,
        sources: ragChunks.map((chunk) => chunk.source)
      }
    };
  }
};

const compareAssets = async (symbols) => {
  const settled = await Promise.allSettled(symbols.map((symbol) => getStockQuote(symbol)));
  const assets = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);

  const client = getOpenAIClient();
  const ragChunks = await retrieveRagContext({
    query: `Compare these assets: ${symbols.join(', ')}`,
    runtimeContext: { comparisonData: assets },
    client
  });
  const ragContext = formatRagContext(ragChunks);

  if (!client) {
    return {
      comparison: 'AI comparison is currently running in limited mode because an AI provider is unavailable.',
      assets,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }

  const prompt = `Compare these Indian stocks/assets:
${assets.map((asset) => `${asset.symbol}: INR ${toNumber(asset.price)} | Change ${toNumber(asset.changePercent)}% | P/E ${toNumber(asset.pe, 0)}`).join('\n')}

Explain relative strength, valuation differences, and key watchpoints in simple language under 220 words.`;

  try {
    const response = await createCompletion(client, [
      { role: 'system', content: `${FINANCIAL_KNOWLEDGE}\n\nRetrieved context:\n${ragContext}` },
      { role: 'user', content: prompt }
    ], {
      max_tokens: 320
    });

    return {
      comparison: response.choices[0].message.content,
      assets,
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  } catch (err) {
    return {
      comparison: 'Comparison service unavailable. Please verify market data manually for now.',
      assets,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }
};

const getForecast = async (symbol, scenario) => {
  let quote = null;
  let history = [];

  try {
    [quote, history] = await Promise.all([
      getStockQuote(symbol),
      getHistoricalData(symbol, '1y')
    ]);
  } catch (err) {
    return {
      forecast: `Scenario analysis for ${symbol} is running in fallback mode due to missing market data.`,
      symbol,
      scenario,
      isFallback: true,
      fallbackReason: 'Unable to load live market context'
    };
  }

  const client = getOpenAIClient();
  const ragChunks = await retrieveRagContext({
    query: `Scenario analysis for ${symbol}: ${scenario}`,
    runtimeContext: { symbol, quote, history, scenario },
    client
  });
  const ragContext = formatRagContext(ragChunks);

  if (!client) {
    return {
      forecast: `Scenario analysis for ${symbol} is currently running in limited mode because an AI provider is unavailable.`,
      symbol,
      scenario,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }

  const prompt = `Based on ${symbol} (current INR ${toNumber(quote.price)}, P/E ${toNumber(quote.pe, 0)}) and this scenario: "${scenario}"
Provide a concise scenario analysis with:
- Potential impact channels
- Historical pattern references
- Key levels or indicators to monitor
Keep under 220 words.`;

  try {
    const response = await createCompletion(client, [
      { role: 'system', content: `${FINANCIAL_KNOWLEDGE}\n\nRetrieved context:\n${ragContext}` },
      { role: 'user', content: prompt }
    ], {
      max_tokens: 320
    });

    return {
      forecast: response.choices[0].message.content,
      symbol,
      scenario,
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  } catch (err) {
    return {
      forecast: `Scenario analysis for ${symbol} could not use OpenAI at the moment.`,
      symbol,
      scenario,
      isFallback: true,
      fallbackReason: getFallbackReason(),
      rag: { enabled: true, sources: ragChunks.map((chunk) => chunk.source) }
    };
  }
};

const getAIStatus = () => {
  const config = getRuntimeAIConfig();

  return {
    openai: {
      configured: Boolean(config.apiKey),
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
      keySource: config.keySource,
      lastError: lastOpenAIError
    },
    rag: getRagStatus(),
    sentiment: getSentimentProviderStatus()
  };
};

const runAIDiagnostics = async () => {
  const status = getAIStatus();
  const checks = [];

  if (!status.openai.configured) {
    return {
      ok: false,
      reason: 'No AI key found. Set GROQ_API_KEY (recommended), OPENAI_API_KEY, or HF_TOKEN with an OpenAI-compatible base URL.',
      checks,
      ...status
    };
  }

  const client = getOpenAIClient();

  try {
    const completion = await createCompletion(client, [
      { role: 'system', content: 'You are a diagnostics assistant. Reply with exactly: OK' },
      { role: 'user', content: 'Health check' }
    ], {
      temperature: 0,
      max_tokens: 5
    });

    checks.push({
      check: 'chat.completions',
      ok: true,
      model: completion.model
    });
  } catch (err) {
    checks.push({
      check: 'chat.completions',
      ok: false,
      error: toErrorMessage(err)
    });
  }

  if (status.rag.useEmbeddings) {
    try {
      await client.embeddings.create({
        model: status.rag.embeddingModel,
        input: 'RAG diagnostics probe'
      });

      checks.push({
        check: 'embeddings',
        ok: true,
        model: status.rag.embeddingModel
      });
    } catch (err) {
      setOpenAIError(err);
      checks.push({
        check: 'embeddings',
        ok: false,
        error: toErrorMessage(err)
      });
    }
  } else {
    checks.push({
      check: 'embeddings',
      ok: true,
      skipped: true,
      reason: 'RAG_USE_EMBEDDINGS is false'
    });
  }

  const ok = checks.every((item) => item.ok);

  return {
    ok,
    checks,
    ...getAIStatus()
  };
};

const getFallbackResponse = (message) => {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('sip')) return 'SIP (Systematic Investment Plan) lets you invest a fixed amount at regular intervals in mutual funds. Starting early and staying consistent can help compounding over long periods. This is educational content, not financial advice.';
  if (lower.includes('nifty') || lower.includes('sensex')) return 'Nifty 50 tracks 50 large-cap companies on NSE, while Sensex tracks 30 companies on BSE. Both are broad indicators of Indian equity sentiment. This is educational content, not financial advice.';
  if (lower.includes('pe') || lower.includes('p/e')) return 'P/E ratio shows how much investors pay for each unit of company earnings. Always compare P/E with sector peers and growth outlook, not in isolation. This is educational content, not financial advice.';
  return 'I am Arth, your financial co-pilot. I can explain market concepts, analyze stocks and mutual funds, and summarize market context. This is educational content, not financial advice.';
};

const getFallbackStockAnalysis = (symbol) => {
  return `Quick analysis for ${symbol}:\n\nTechnical view: Price action appears range-bound; track breakout confirmation with volume.\nFundamental view: Compare valuation and earnings trend against peers.\nKey risks: earnings miss, valuation compression, sector slowdown, and macro shocks.\n\nThis is educational content, not financial advice.`;
};

const buildRuleBasedDeepAnalysis = ({ symbol, quote, technicals = {}, fundamentals = {}, shareholding = [], news = [], relatedStocks = [] }) => {
  const rsi = toNumber(technicals.rsi14, 0);
  const trend = technicals.trend || 'unknown';
  const valuationGap = toNumber(fundamentals.pe, 0) - toNumber(fundamentals.industryPe, 0);

  const trendLabel = trend === 'bullish'
    ? 'Trend is bullish with price strength above moving averages.'
    : trend === 'bearish'
      ? 'Trend is bearish with price below key moving averages.'
      : 'Trend is mixed/sideways; wait for directional confirmation.';

  const rsiLabel = rsi >= 70
    ? 'RSI indicates overbought zone; momentum can cool quickly.'
    : rsi <= 30
      ? 'RSI indicates oversold zone; watch for rebound confirmation.'
      : 'RSI is neutral; trend continuation depends on volume confirmation.';

  const valuationLabel = fundamentals.pe && fundamentals.industryPe
    ? (valuationGap > 5
      ? 'Valuation appears richer than industry average; execution must justify premium.'
      : valuationGap < -5
        ? 'Valuation appears below industry average; monitor whether this is opportunity or risk discount.'
        : 'Valuation is near industry average; track earnings delivery for re-rating.')
    : 'Valuation comparison is limited by incomplete industry metrics.';

  const shareholdingText = shareholding.length
    ? shareholding.map((item) => `${item.label}: ${item.value}%`).join('; ')
    : 'Shareholding pattern unavailable from current feed.';

  const headlineText = news.slice(0, 3).map((item) => item.headline).join(' | ') || 'No high-confidence related headlines currently available.';
  const peersText = relatedStocks.length
    ? relatedStocks.map((item) => `${item.symbol} (${toNumber(item.changePercent)}%)`).join(', ')
    : 'Related peer snapshot unavailable.';

  return `Deep realtime analysis for ${symbol} (rule-based):

1) Executive Summary
- Price: INR ${toNumber(quote?.price)} (${toNumber(quote?.changePercent)}%)
- ${trendLabel}

2) Technical Setup (1-3 sessions)
- SMA20: ${toNumber(technicals.sma20)} | SMA50: ${toNumber(technicals.sma50)}
- EMA20: ${toNumber(technicals.ema20)} | EMA50: ${toNumber(technicals.ema50)}
- RSI14: ${toNumber(technicals.rsi14)} | MACD: ${toNumber(technicals.macd?.macd)}
- Support: ${toNumber(technicals.support)} | Resistance: ${toNumber(technicals.resistance)}
- ${rsiLabel}

3) Fundamental Context
- PE: ${toNumber(fundamentals.pe)} vs Industry PE: ${toNumber(fundamentals.industryPe)}
- EPS: ${toNumber(fundamentals.eps)} | ROE: ${toNumber(fundamentals.roe)} | Debt/Equity: ${toNumber(fundamentals.debtToEquity)}
- ${valuationLabel}

4) Shareholding Quality Read
- ${shareholdingText}

5) News and Peer Context
- Headlines: ${headlineText}
- Related stocks: ${peersText}

6) Risk Checklist
- Watch support/resistance invalidation.
- Track earnings commentary, volume behavior, and broad index risk sentiment.
- Validate F&O positioning (OI and IV) before taking leveraged exposure.

This is educational content, not financial advice.`;
};

module.exports = {
  chat,
  analyzeStock,
  analyzeMutualFund,
  compareAssets,
  getForecast,
  getAIStatus,
  runAIDiagnostics
};
