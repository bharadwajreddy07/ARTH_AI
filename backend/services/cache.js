const NodeCache = require('node-cache');
const { createClient } = require('redis');

const TTL = {
  market: 300,       // 5 min for prices
  news: 900,         // 15 min for news
  fundamentals: 3600, // 1 hr for fundamentals
  mf: 86400          // 24 hr for MF NAV
};

const marketCache = new NodeCache({ stdTTL: TTL.market });
const newsCache = new NodeCache({ stdTTL: TTL.news });
const fundamentalsCache = new NodeCache({ stdTTL: TTL.fundamentals });
const mfCache = new NodeCache({ stdTTL: TTL.mf });

const REDIS_PREFIX = 'arth';
const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let redisReady = false;
let redisErrorLogged = false;

if (REDIS_URL) {
  redisClient = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: () => false
    }
  });

  redisClient.on('ready', () => {
    redisReady = true;
    console.log('✅ Redis cache connected');
  });

  redisClient.on('end', () => {
    redisReady = false;
    console.warn('⚠️ Redis connection closed. Falling back to in-memory cache.');
  });

  redisClient.on('error', (err) => {
    redisReady = false;
    if (!redisErrorLogged) {
      console.warn(`⚠️ Redis cache error: ${err.message}. Falling back to in-memory cache.`);
      redisErrorLogged = true;
    }
  });

  redisClient.connect().catch((err) => {
    redisReady = false;
    if (!redisErrorLogged) {
      console.warn(`⚠️ Redis unavailable (${err.message}). Using in-memory cache only.`);
      redisErrorLogged = true;
    }
  });
} else {
  console.log('ℹ️ REDIS_URL not set. Using in-memory cache only.');
}

const getRedisKey = (namespace, key) => `${REDIS_PREFIX}:${namespace}:${key}`;

const createNamespace = (namespace, localCache, ttl) => ({
  get: async (key) => {
    const localValue = localCache.get(key);
    if (localValue !== undefined) return localValue;

    if (!redisReady || !redisClient) return undefined;

    try {
      const rawValue = await redisClient.get(getRedisKey(namespace, key));
      if (!rawValue) return undefined;

      const parsed = JSON.parse(rawValue);
      localCache.set(key, parsed);
      return parsed;
    } catch (err) {
      return undefined;
    }
  },
  set: async (key, value) => {
    localCache.set(key, value);

    if (!redisReady || !redisClient) return true;

    try {
      await redisClient.set(getRedisKey(namespace, key), JSON.stringify(value), {
        EX: ttl
      });
    } catch (err) {
      // Keep local cache as source of truth if Redis write fails.
    }

    return true;
  },
  del: async (key) => {
    localCache.del(key);

    if (!redisReady || !redisClient) return true;

    try {
      await redisClient.del(getRedisKey(namespace, key));
    } catch (err) {
      // Ignore Redis delete failures and preserve local behavior.
    }

    return true;
  }
});

module.exports = {
  market: createNamespace('market', marketCache, TTL.market),
  news: createNamespace('news', newsCache, TTL.news),
  fundamentals: createNamespace('fundamentals', fundamentalsCache, TTL.fundamentals),
  mf: createNamespace('mf', mfCache, TTL.mf),
  isRedisReady: () => redisReady
};
