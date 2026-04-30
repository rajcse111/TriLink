require('dotenv').config();

const app                = require('./src/app');
const { testConnection } = require('./src/config/database');
const { connectRedis }   = require('./src/config/redis');
const { startScheduler } = require('./src/services/scheduler.service');
const logger             = require('./src/utils/logger');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  logger.info('Starting TriLink Referral Network API...');

  // Test database connection
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Cannot connect to PostgreSQL. Exiting.');
    process.exit(1);
  }

  // Connect Redis (optional - app runs without it)
  await connectRedis();

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, {
      env:  process.env.NODE_ENV || 'development',
      port: PORT,
      url:  `http://localhost:${PORT}/api`,
    });
  });

  // Start cron scheduler
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }

  // ── Graceful shutdown ────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        const { pool } = require('./src/config/database');
        await pool.end();
        logger.info('PostgreSQL connection pool closed');

        const { getRedis } = require('./src/config/redis');
        const redis = getRedis();
        if (redis) await redis.quit();
        logger.info('Redis connection closed');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });

  return server;
}

startServer().catch((err) => {
  logger.error('Server startup failed', { error: err.message });
  process.exit(1);
});
