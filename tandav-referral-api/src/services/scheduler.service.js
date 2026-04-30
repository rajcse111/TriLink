/**
 * Scheduler Service
 * =================
 * Daily batch processing at 20:00 (configurable via BATCH_PROCESSOR_CRON):
 *  1. Stage validation for all active users
 *  2. Daily income summaries
 *  3. Cleanup expired OTPs
 */

const cron             = require('node-cron');
const { query }        = require('../config/database');
const { batchStageValidation } = require('./stage.service');
const logger           = require('../utils/logger');

const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE || '2000', 10);
const BATCH_CRON   = process.env.BATCH_PROCESSOR_CRON || '0 20 * * *';

let schedulerRunning = false;

// ── Main daily batch job ───────────────────────────────────────────

async function runDailyBatch() {
  if (schedulerRunning) {
    logger.warn('Daily batch already running - skipping this trigger');
    return;
  }

  schedulerRunning = true;
  const startedAt = new Date();
  let logId;

  try {
    // Log batch start
    const logResult = await query(
      `INSERT INTO batch_logs (batch_type, status) VALUES ('daily_batch', 'running') RETURNING id`,
      []
    );
    logId = logResult.rows[0].id;

    logger.info('=== Daily batch started ===', { time: startedAt });

    // 1. Stage validation
    logger.info('[1/3] Running stage validation...');
    const stageResult = await batchStageValidation(BATCH_SIZE);

    // 2. Expired OTP cleanup
    logger.info('[2/3] Cleaning up expired OTPs...');
    const otpCleanup = await query(
      `DELETE FROM otps WHERE expires_at < NOW() - INTERVAL '1 hour' RETURNING id`,
      []
    );

    // 3. Clean old notification records (> 90 days, read)
    logger.info('[3/3] Archiving old notifications...');
    const notifCleanup = await query(
      `DELETE FROM notifications
       WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days' RETURNING id`,
      []
    );

    const summary = {
      stageValidation:   stageResult,
      otpCleaned:        otpCleanup.rowCount,
      notifCleaned:      notifCleanup.rowCount,
      duration:          `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    };

    logger.info('=== Daily batch completed ===', summary);

    await query(
      `UPDATE batch_logs
       SET status = 'completed', completed_at = NOW(),
           total_processed = $1, success_count = $2, error_count = $3
       WHERE id = $4`,
      [stageResult.processed, stageResult.processed - stageResult.errors, stageResult.errors, logId]
    );

    return summary;
  } catch (err) {
    logger.error('Daily batch FAILED', { error: err.message });
    if (logId) {
      await query(
        `UPDATE batch_logs SET status = 'failed', completed_at = NOW(),
         error_details = $1 WHERE id = $2`,
        [JSON.stringify([{ error: err.message }]), logId]
      ).catch(() => {});
    }
    throw err;
  } finally {
    schedulerRunning = false;
  }
}

// ── Start scheduled jobs ───────────────────────────────────────────

function startScheduler() {
  if (!cron.validate(BATCH_CRON)) {
    logger.error('Invalid BATCH_PROCESSOR_CRON expression', { cron: BATCH_CRON });
    return;
  }

  const job = cron.schedule(BATCH_CRON, async () => {
    logger.info('Cron triggered: daily batch');
    try {
      await runDailyBatch();
    } catch (err) {
      logger.error('Cron job error', { error: err.message });
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('Scheduler started', { cron: BATCH_CRON, timezone: 'Asia/Kolkata' });
  return job;
}

module.exports = { startScheduler, runDailyBatch };
