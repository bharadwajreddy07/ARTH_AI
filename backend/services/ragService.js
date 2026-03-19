const fs = require('fs');
const path = require('path');
const { QdrantClient } = require('@qdrant/js-client-rest');

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const RAG_TOP_K = Math.max(2, Number(process.env.RAG_TOP_K) || 4);
const RAG_USE_EMBEDDINGS = String(process.env.RAG_USE_EMBEDDINGS || 'false').toLowerCase() === 'true';
const RAG_MAX_INGEST_DOCS = Math.max(10, Number(process.env.RAG_MAX_INGEST_DOCS) || 500);

const QDRANT_URL = String(process.env.QDRANT_URL || '').trim();
const QDRANT_API_KEY = String(process.env.QDRANT_API_KEY || '').trim();
const QDRANT_COLLECTION = String(process.env.QDRANT_COLLECTION || 'arth_rag_chunks').trim();
const VECTOR_DIMENSION = Math.max(64, Number(process.env.RAG_VECTOR_DIMENSION) || 256);

const RAG_STORAGE_DIR = path.resolve(__dirname, '..', 'data');
const RAG_STORAGE_FILE = path.join(RAG_STORAGE_DIR, 'rag-ingested-documents.json');

const EMBEDDING_CACHE = new Map();
let INGESTED_DOCUMENTS = [];
let LAST_INGESTION_AT = null;

let qdrantClient = null;
let qdrantReady = false;
let qdrantLastError = null;

const STATIC_RAG_DOCUMENTS = [
  {
    source: 'problem-statement',
    title: 'Arth mission',
    content: 'Retail investors face information overload and analysis paralysis when interpreting market data. Arth bridges raw data and actionable insight with an intuitive assistant that explains why markets move, not just what moved.'
  },
  {
    source: 'objectives',
    title: 'Arth product objectives',
    content: 'Arth should simplify complex financial data into clear actionable insights, contextualize market movements and news, enable cross-asset comparison across stocks and mutual funds, provide explainable scenario forecasting from historical trends, and increase retail investor confidence through guided educational support.'
  },
  {
    source: 'technology-stack',
    title: 'Arth architecture',
    content: 'Arth runs on MERN: React frontend, Node and Express backend, MongoDB persistence, and AI orchestration using retrieval-augmented generation with LLM responses grounded in live market and news context from providers like Yahoo Finance, Alpha Vantage, Finnhub, and News APIs.'
  },
  {
    source: 'investor-education',
    title: 'Interpret metrics in context',
    content: 'Single metrics should never be used in isolation. P/E can vary by sector, market cap and growth profile. Always combine valuation, earnings trend, debt levels, and management quality with macro context such as RBI rates and liquidity.'
  },
  {
    source: 'risk-framework',
    title: 'Balanced decision framework',
    content: 'For any stock or mutual fund analysis, present opportunities and risks together. Mention concentration risk, valuation risk, earnings risk, liquidity, and policy risk. Avoid absolute buy or sell language.'
  },
  {
    source: 'india-market-context',
    title: 'Indian market structure',
    content: 'NSE and BSE are the primary equity venues in India. Nifty 50 and Sensex represent broad large-cap sentiment. RBI policy, FII and DII flows, crude prices, INR movement and earnings cycles are major market drivers.'
  },
  {
    source: 'mf-framework',
    title: 'Mutual fund evaluation checklist',
    content: 'Compare mutual funds by category-adjusted returns, drawdown behavior, expense ratio, rolling returns consistency, and portfolio concentration. For SIP planning, time horizon and risk tolerance matter more than short-term ranking.'
  },
  {
    source: 'fno-framework',
    title: 'F and O analysis basics',
    content: 'For futures and options, explain lot size, expiry, implied volatility and open interest in simple terms. Mention that leverage magnifies both gains and losses. Use F and O discussion only as educational context and avoid directional trade calls.'
  },
  {
    source: 'bond-framework',
    title: 'Indian bond analysis basics',
    content: 'For Indian bonds, explain relationship between bond prices and yields, RBI policy sensitivity, duration risk, credit risk, and liquidity. Distinguish sovereign G-Secs from corporate bonds. Present laddering and allocation ideas as educational concepts, not advice.'
  },
  {
    source: 'responsible-guidance',
    title: 'Educational-first guidance',
    content: 'The assistant provides educational guidance and scenario analysis. It should avoid personalized investment advice and encourage users to consult a SEBI-registered advisor for suitability decisions.'
  }
];

const sanitizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const tokenize = (text) => sanitizeText(text)
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((token) => token.length > 2);

const chunkText = (source, title, content, maxChars = 520, overlap = 90) => {
  const normalized = sanitizeText(content);
  if (!normalized) return [];

  if (normalized.length <= maxChars) {
    return [{ source, title, content: normalized }];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(cursor + maxChars, normalized.length);
    const slice = normalized.slice(cursor, end);
    chunks.push({ source, title, content: slice });
    if (end >= normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
};

const buildStringHash = (input = '') => {
  let hash = 0;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const normalizeIngestedDocument = (doc = {}, index = 0, sourceTag = 'manual') => {
  const content = sanitizeText(doc.content || doc.text || doc.body || '');
  if (!content) return null;

  const source = sanitizeText(doc.source || sourceTag || 'manual');
  const title = sanitizeText(doc.title || doc.name || `Document ${index + 1}`);
  const metadata = (doc.metadata && typeof doc.metadata === 'object') ? doc.metadata : {};
  const checksum = buildStringHash(`${source}|${title}|${content.slice(0, 2400)}`);

  return {
    id: sanitizeText(doc.id) || `ingested-${checksum}`,
    source,
    title,
    content,
    metadata,
    checksum,
    ingestedAt: sanitizeText(doc.ingestedAt) || new Date().toISOString()
  };
};

const ensureStorageDir = () => {
  if (!fs.existsSync(RAG_STORAGE_DIR)) {
    fs.mkdirSync(RAG_STORAGE_DIR, { recursive: true });
  }
};

const persistIngestedDocuments = () => {
  try {
    ensureStorageDir();
    fs.writeFileSync(RAG_STORAGE_FILE, JSON.stringify(INGESTED_DOCUMENTS, null, 2), 'utf8');
  } catch (err) {
    qdrantLastError = qdrantLastError || `RAG storage write failed: ${err.message}`;
  }
};

const loadPersistedDocuments = () => {
  try {
    if (!fs.existsSync(RAG_STORAGE_FILE)) return [];

    const raw = fs.readFileSync(RAG_STORAGE_FILE, 'utf8');
    if (!raw.trim()) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((doc, index) => normalizeIngestedDocument(doc, index, 'persisted'))
      .filter(Boolean)
      .slice(-RAG_MAX_INGEST_DOCS);
  } catch (err) {
    return [];
  }
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isRuntimeSource = (source = '') => {
  const normalized = String(source || '').toLowerCase();
  return normalized.startsWith('live-')
    || normalized.startsWith('price-')
    || normalized.startsWith('news-')
    || normalized.startsWith('realtime-')
    || normalized === 'asset-comparison'
    || normalized === 'user-scenario';
};

const buildHashVector = (text) => {
  const vector = new Array(VECTOR_DIMENSION).fill(0);
  const tokens = tokenize(text);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const hash = buildStringHash(`${token}:${i}`);
    vector[hash % VECTOR_DIMENSION] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
};

const getQdrantClient = () => {
  if (!QDRANT_URL) return null;

  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {})
    });
  }

  return qdrantClient;
};

const ensureQdrantCollection = async () => {
  const client = getQdrantClient();
  if (!client) return false;
  if (qdrantReady) return true;

  try {
    const collections = await client.getCollections();
    const exists = Array.isArray(collections?.collections)
      && collections.collections.some((item) => item.name === QDRANT_COLLECTION);

    if (!exists) {
      await client.createCollection(QDRANT_COLLECTION, {
        vectors: {
          size: VECTOR_DIMENSION,
          distance: 'Cosine'
        }
      });
    }

    qdrantReady = true;
    qdrantLastError = null;
    return true;
  } catch (err) {
    qdrantLastError = err.message;
    return false;
  }
};

const indexChunksToVectorStore = async (chunks = []) => {
  if (!QDRANT_URL || !Array.isArray(chunks) || !chunks.length) return false;

  const client = getQdrantClient();
  const ready = await ensureQdrantCollection();
  if (!client || !ready) return false;

  try {
    const now = Date.now();
    const points = chunks.map((chunk, index) => {
      const fingerprint = `${chunk.source}|${chunk.title}|${chunk.content.slice(0, 200)}|${index}`;
      return {
        id: `${now}-${buildStringHash(fingerprint)}`,
        vector: buildHashVector(`${chunk.title} ${chunk.content}`),
        payload: {
          source: chunk.source,
          title: chunk.title,
          content: chunk.content
        }
      };
    });

    await client.upsert(QDRANT_COLLECTION, {
      wait: false,
      points
    });

    qdrantLastError = null;
    return true;
  } catch (err) {
    qdrantLastError = err.message;
    return false;
  }
};

const searchVectorStore = async (query, limit = RAG_TOP_K * 2) => {
  if (!QDRANT_URL || !sanitizeText(query)) return [];

  const client = getQdrantClient();
  const ready = await ensureQdrantCollection();
  if (!client || !ready) return [];

  try {
    const matches = await client.search(QDRANT_COLLECTION, {
      vector: buildHashVector(query),
      limit: Math.max(limit, RAG_TOP_K),
      score_threshold: 0.05,
      with_payload: true
    });

    return (Array.isArray(matches) ? matches : []).map((item) => ({
      source: item?.payload?.source || 'vector-store',
      title: item?.payload?.title || 'Indexed chunk',
      content: item?.payload?.content || '',
      score: Number(toNumber(item?.score, 0).toFixed(4))
    })).filter((item) => item.content);
  } catch (err) {
    qdrantLastError = err.message;
    return [];
  }
};

const buildRuntimeDocuments = (runtimeContext = {}) => {
  const docs = [];
  const { symbol, quote, news, history, scenario, comparisonData } = runtimeContext;

  if (symbol && quote) {
    docs.push({
      source: 'live-quote',
      title: `${symbol} live quote`,
      content: `${symbol} trades at ${toNumber(quote.price)} INR with change ${toNumber(quote.change)} (${toNumber(quote.changePercent)}%). P/E ${toNumber(quote.pe, 0)}, 52-week high ${toNumber(quote.high52w)}, 52-week low ${toNumber(quote.low52w)}, market cap ${toNumber(quote.marketCap)}.`
    });
  }

  if (Array.isArray(history) && history.length) {
    const recent = history.slice(-20);
    const start = recent[0];
    const end = recent[recent.length - 1];
    const startClose = toNumber(start?.close);
    const endClose = toNumber(end?.close);
    const pct = startClose ? (((endClose - startClose) / startClose) * 100).toFixed(2) : '0.00';

    docs.push({
      source: 'price-trend',
      title: `${symbol || 'asset'} recent trend`,
      content: `Recent trend from ${start?.date || 'start'} to ${end?.date || 'end'} moved from ${startClose} to ${endClose} INR (${pct}%). Use with volume and earnings context for confirmation.`
    });
  }

  if (Array.isArray(news) && news.length) {
    const topNews = news.slice(0, 8)
      .map((item) => `${item.headline || ''} [${item.source || 'source'} | ${item.datetime || 'time'} | ${item.confidenceLabel || 'unknown'} ${toNumber(item.confidenceScore)} | ${item.sentiment?.label || 'neutral'}]`)
      .join(' | ');

    docs.push({
      source: 'realtime-news-digest',
      title: `${symbol || 'market'} realtime internet news digest`,
      content: `Recent headlines and sentiment: ${topNews}`
    });

    news.slice(0, 8).forEach((item, index) => {
      docs.push({
        source: 'realtime-news-article',
        title: `${symbol || 'market'} article ${index + 1}`,
        content: `Headline: ${item.headline || ''}. Source: ${item.source || 'unknown'}. Published: ${item.datetime || 'unknown'}. Confidence: ${item.confidenceLabel || 'unknown'} ${toNumber(item.confidenceScore)}. Summary: ${item.summary || ''}`
      });
    });
  }

  if (scenario) {
    docs.push({
      source: 'user-scenario',
      title: 'Scenario context',
      content: `Scenario for analysis: ${sanitizeText(scenario)}`
    });
  }

  if (Array.isArray(comparisonData) && comparisonData.length) {
    docs.push({
      source: 'asset-comparison',
      title: 'Comparison universe snapshot',
      content: comparisonData
        .map((asset) => `${asset.symbol}: price ${toNumber(asset.price)} INR, change ${toNumber(asset.changePercent)}%, PE ${toNumber(asset.pe, 0)}`)
        .join(' | ')
    });
  }

  return docs;
};

const keywordScore = (query, text) => {
  const qTokens = tokenize(query);
  const tTokens = tokenize(text);
  if (!qTokens.length || !tTokens.length) return 0;

  const querySet = new Set(qTokens);
  const textSet = new Set(tTokens);

  let overlap = 0;
  for (const token of querySet) {
    if (textSet.has(token)) overlap += 1;
  }

  const coverage = overlap / querySet.size;
  const density = overlap / textSet.size;
  return coverage * 0.7 + density * 0.3;
};

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getEmbedding = async (client, text) => {
  const normalized = sanitizeText(text).slice(0, 1800);
  if (!normalized) return null;

  const key = `${OPENAI_EMBEDDING_MODEL}:${normalized}`;
  if (EMBEDDING_CACHE.has(key)) return EMBEDDING_CACHE.get(key);

  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: normalized
  });

  const vector = response?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return null;

  EMBEDDING_CACHE.set(key, vector);
  return vector;
};

const getIngestedChunks = () => {
  return INGESTED_DOCUMENTS.flatMap((doc) =>
    chunkText(`ingested-${doc.source}`, doc.title, doc.content)
  );
};

const buildCorpusChunks = (runtimeContext = {}) => {
  const staticChunks = STATIC_RAG_DOCUMENTS.flatMap((doc) =>
    chunkText(doc.source, doc.title, doc.content)
  );

  const ingestedChunks = getIngestedChunks();
  const runtimeChunks = buildRuntimeDocuments(runtimeContext).flatMap((doc) =>
    chunkText(doc.source, doc.title, doc.content)
  );

  return [...staticChunks, ...ingestedChunks, ...runtimeChunks];
};

const ingestRagDocuments = async (documents = [], options = {}) => {
  if (!Array.isArray(documents)) {
    throw new Error('documents must be an array');
  }

  const replace = Boolean(options.replace);
  const sourceTag = sanitizeText(options.source || 'manual');

  if (replace) {
    INGESTED_DOCUMENTS = [];
  }

  const knownChecksums = new Set(INGESTED_DOCUMENTS.map((doc) => doc.checksum));
  const normalizedBatch = [];

  for (let i = 0; i < documents.length; i += 1) {
    const normalized = normalizeIngestedDocument(documents[i], i, sourceTag);
    if (!normalized) continue;
    if (knownChecksums.has(normalized.checksum)) continue;
    knownChecksums.add(normalized.checksum);
    normalizedBatch.push(normalized);
  }

  if (!normalizedBatch.length) {
    return {
      inserted: 0,
      totalDocuments: INGESTED_DOCUMENTS.length,
      totalChunks: getIngestedChunks().length,
      vectorIndexed: false
    };
  }

  INGESTED_DOCUMENTS.push(...normalizedBatch);
  INGESTED_DOCUMENTS = INGESTED_DOCUMENTS.slice(-RAG_MAX_INGEST_DOCS);

  LAST_INGESTION_AT = new Date().toISOString();
  persistIngestedDocuments();

  const batchChunks = normalizedBatch.flatMap((doc) =>
    chunkText(`ingested-${doc.source}`, doc.title, doc.content)
  );
  const vectorIndexed = await indexChunksToVectorStore(batchChunks);

  return {
    inserted: normalizedBatch.length,
    totalDocuments: INGESTED_DOCUMENTS.length,
    totalChunks: getIngestedChunks().length,
    vectorIndexed
  };
};

const listRagDocuments = (limit = 25) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 200));
  return INGESTED_DOCUMENTS
    .slice(-safeLimit)
    .reverse()
    .map((doc) => ({
      id: doc.id,
      source: doc.source,
      title: doc.title,
      metadata: doc.metadata,
      ingestedAt: doc.ingestedAt,
      contentLength: doc.content.length,
      contentPreview: doc.content.slice(0, 220)
    }));
};

const clearRagDocuments = async () => {
  INGESTED_DOCUMENTS = [];
  LAST_INGESTION_AT = new Date().toISOString();
  persistIngestedDocuments();

  let vectorStoreReset = false;
  if (QDRANT_URL) {
    const client = getQdrantClient();
    if (client) {
      try {
        await client.deleteCollection(QDRANT_COLLECTION);
        qdrantReady = false;
        vectorStoreReset = await ensureQdrantCollection();
      } catch (err) {
        qdrantLastError = err.message;
      }
    }
  }

  return {
    cleared: true,
    totalDocuments: 0,
    totalChunks: 0,
    vectorStoreReset
  };
};

const retrieveRagContext = async ({ query, runtimeContext = {}, client }) => {
  const corpus = buildCorpusChunks(runtimeContext);
  if (!corpus.length || !sanitizeText(query)) {
    return [];
  }

  const baseRank = corpus
    .map((chunk) => {
      const baseScore = keywordScore(query, `${chunk.title} ${chunk.content}`);
      const runtimeBonus = isRuntimeSource(chunk.source) ? 0.12 : 0;
      return {
        ...chunk,
        score: Number((baseScore + runtimeBonus).toFixed(4))
      };
    })
    .sort((a, b) => b.score - a.score);

  const vectorRank = await searchVectorStore(query, RAG_TOP_K * 2);

  const merged = new Map();
  const upsert = (chunk, score) => {
    const key = `${chunk.source}|${chunk.title}|${chunk.content}`;
    const current = merged.get(key);
    if (!current || score > current.score) {
      merged.set(key, {
        source: chunk.source,
        title: chunk.title,
        content: chunk.content,
        score: Number(score.toFixed(4))
      });
    }
  };

  baseRank.forEach((entry) => upsert(entry, entry.score));
  vectorRank.forEach((entry) => {
    const lexical = keywordScore(query, `${entry.title} ${entry.content}`);
    const blended = (entry.score * 0.55) + (lexical * 0.45);
    upsert(entry, blended);
  });

  const ranked = Array.from(merged.values()).sort((a, b) => b.score - a.score);

  if (!RAG_USE_EMBEDDINGS || !client) {
    return ranked.slice(0, RAG_TOP_K);
  }

  try {
    const queryEmbedding = await getEmbedding(client, query);
    if (!queryEmbedding) {
      return ranked.slice(0, RAG_TOP_K);
    }

    const candidatePool = ranked.slice(0, Math.max(RAG_TOP_K * 3, 10));
    const withEmbeddingScore = await Promise.all(candidatePool.map(async (entry) => {
      const chunkEmbedding = await getEmbedding(client, `${entry.title}\n${entry.content}`);
      const embeddingScore = chunkEmbedding ? (cosineSimilarity(queryEmbedding, chunkEmbedding) + 1) / 2 : 0;
      const blended = (entry.score * 0.65) + (embeddingScore * 0.35);

      return {
        ...entry,
        score: Number(blended.toFixed(4))
      };
    }));

    return withEmbeddingScore
      .sort((a, b) => b.score - a.score)
      .slice(0, RAG_TOP_K);
  } catch (err) {
    return ranked.slice(0, RAG_TOP_K);
  }
};

const formatRagContext = (chunks) => {
  if (!Array.isArray(chunks) || !chunks.length) return '';

  return chunks
    .map((chunk, index) => `[${index + 1}] (${chunk.source}) ${chunk.content}`)
    .join('\n');
};

const getRagStatus = () => ({
  enabled: true,
  topK: RAG_TOP_K,
  useEmbeddings: RAG_USE_EMBEDDINGS,
  embeddingModel: OPENAI_EMBEDDING_MODEL,
  staticDocuments: STATIC_RAG_DOCUMENTS.length,
  ingestedDocuments: INGESTED_DOCUMENTS.length,
  ingestedChunks: getIngestedChunks().length,
  corpusDocuments: STATIC_RAG_DOCUMENTS.length + INGESTED_DOCUMENTS.length,
  lastIngestionAt: LAST_INGESTION_AT,
  storageFile: RAG_STORAGE_FILE,
  vectorStore: {
    provider: 'qdrant',
    configured: Boolean(QDRANT_URL),
    collection: QDRANT_URL ? QDRANT_COLLECTION : null,
    dimension: VECTOR_DIMENSION,
    lastError: qdrantLastError
  }
});

INGESTED_DOCUMENTS = loadPersistedDocuments();

module.exports = {
  retrieveRagContext,
  formatRagContext,
  getRagStatus,
  ingestRagDocuments,
  listRagDocuments,
  clearRagDocuments
};
