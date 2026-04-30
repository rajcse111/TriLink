const Redis  = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

function createRedisClient() {
  const client = new Redis({
    host:              process.env.REDIS_HOST     || 'localhost',
    port:              parseInt(process.env.REDIS_PORT || '6379', 10),
    password:          process.env.REDIS_PASSWORD || undefined,
    db:                parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: 3,
    lazyConnect:       true,
    enableOfflineQueue: false,
    connectTimeout:    5000,
    keyPrefix:         'trilink:',
  });

  client.on('connect',  () => logger.info('Redis connected'));
  client.on('error',    (err) => logger.error('Redis error', { error: err.message }));
  client.on('close',    () => logger.warn('Redis connection closed'));

  return client;
}

async function connectRedis() {
  try {
    redisClient = createRedisClient();
    await redisClient.connect();
    return redisClient;
  } catch (err) {
    logger.warn('Redis connection failed - running without cache', { error: err.message });
    redisClient = null;
    return null;
  }
}

function getRedis() {
  return redisClient;
}

// ── Cache helpers ──────────────────────────────────────────────────

async function cacheGet(key) {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redisClient) return;
  try {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silent failure - cache is optional
  }
}

async function cacheDel(key) {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Silent
  }
}

async function cacheDelPattern(pattern) {
  if (!redisClient) return;
  try {
    const keys = await redisClient.keys(`trilink:${pattern}`);
    if (keys.length > 0) {
      // Strip the keyPrefix since ioredis already adds it
      const rawKeys = keys.map(k => k.replace('trilink:', ''));
      await redisClient.del(...rawKeys);
    }
  } catch {
    // Silent
  }
}

module.exports = { connectRedis, getRedis, cacheGet, cacheSet, cacheDel, cacheDelPattern };
