const { Pool } = require('pg');
const logger   = require('../utils/logger');

const pool = new Pool({
  host:            process.env.DB_HOST     || 'localhost',
  port:            parseInt(process.env.DB_PORT || '5432', 10),
  database:        process.env.DB_NAME     || 'trilink_referral',
  user:            process.env.DB_USER     || 'postgres',
  password:        process.env.DB_PASSWORD || '',
  min:             parseInt(process.env.DB_POOL_MIN || '2', 10),
  max:             parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL client error', { error: err.message });
});

/**
 * Execute a query with optional parameters.
 * Logs slow queries (> 1000ms).
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { duration, query: text.substring(0, 100) });
    }
    return result;
  } catch (err) {
    logger.error('Database query error', { error: err.message, query: text.substring(0, 200) });
    throw err;
  }
}

/**
 * Get a dedicated client for transactions.
 * Always call client.release() in the finally block.
 */
async function getClient() {
  const client = await pool.connect();
  const origQuery = client.query.bind(client);
  // Wrap to log errors
  client.query = async (text, params) => {
    try {
      return await origQuery(text, params);
    } catch (err) {
      logger.error('Transaction query error', { error: err.message });
      throw err;
    }
  };
  return client;
}

async function testConnection() {
  try {
    const result = await query('SELECT NOW() AS now, version() AS version');
    logger.info('PostgreSQL connected', {
      time: result.rows[0].now,
      version: result.rows[0].version.split(' ')[1],
    });
    return true;
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: err.message });
    return false;
  }
}

module.exports = { query, getClient, pool, testConnection };
