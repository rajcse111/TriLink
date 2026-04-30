/**
 * Stage Progression Service
 * =========================
 * Checks and advances user stages based on their active downline count.
 *
 * Stage Requirements:
 *   Stage n is complete when the user has >= required_members active descendants.
 *   required_members(n) = cumsum of 3^1 + 3^2 + ... + 3^n = (3^(n+1) - 3) / 2
 */

const { query, getClient }     = require('../config/database');
const { creditStageBonus }     = require('./payment.service');
const notificationService      = require('./notification.service');
const { countActiveDescendants } = require('./referral.service');
const logger                   = require('../utils/logger');

const MAX_STAGE = parseInt(process.env.STAGE_COUNT || '13', 10);

// ── Stage check (for a single user) ───────────────────────────────

/**
 * Check if a user has completed their current stage and advance if so.
 * Called after any activation in the user's subtree.
 *
 * @param {string} userId
 * @returns {object} { advanced, fromStage, toStage, isRetired }
 */
async function checkAndAdvanceStage(userId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the user row
    const userResult = await client.query(
      `SELECT id, current_stage, is_active, is_retired FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!userResult.rowCount) {
      await client.query('ROLLBACK');
      return { advanced: false };
    }

    const user = userResult.rows[0];
    if (!user.is_active || user.is_retired) {
      await client.query('ROLLBACK');
      return { advanced: false };
    }

    const currentStage = user.current_stage;
    if (currentStage >= MAX_STAGE) {
      // Already at max stage - retire
      if (!user.is_retired) {
        await retireUser(client, userId);
        await client.query('COMMIT');
        return { advanced: false, isRetired: true };
      }
      await client.query('ROLLBACK');
      return { advanced: false };
    }

    // Get stage requirement
    const stageResult = await client.query(
      `SELECT required_members FROM stage_config WHERE stage = $1`,
      [currentStage + 1]
    );
    if (!stageResult.rowCount) {
      await client.query('ROLLBACK');
      return { advanced: false };
    }

    const required = stageResult.rows[0].required_members;

    // Count active descendants
    const activeCount = await countActiveDescendants(userId);

    if (activeCount < required) {
      await client.query('ROLLBACK');
      return {
        advanced:     false,
        currentStage,
        activeCount,
        required,
        progress:     Math.round((activeCount / required) * 100),
      };
    }

    // ── STAGE ADVANCE ──
    const newStage = currentStage + 1;
    const isRetired = newStage >= MAX_STAGE;

    await client.query(
      `UPDATE users
       SET current_stage = $1, last_upgrade_date = NOW(),
           is_retired = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStage, isRetired, userId]
    );

    // Log stage history
    await client.query(
      `INSERT INTO stage_history (user_id, from_stage, to_stage, nodes_count)
       VALUES ($1, $2, $3, $4)`,
      [userId, currentStage, newStage, activeCount]
    );

    await client.query('COMMIT');

    // Credit stage bonus (outside main transaction to avoid holding locks)
    const bonus = await creditStageBonus(userId, newStage, activeCount).catch((err) => {
      logger.error('Stage bonus credit failed', { userId, stage: newStage, error: err.message });
      return 0;
    });

    // Notify user
    const notifType = isRetired ? 'retirement' : 'stage_complete';
    notificationService.notify(userId, notifType, {
      title:   isRetired ? 'Congratulations! You are Retired!' : `Stage ${newStage} Complete!`,
      message: isRetired
        ? `You have completed all ${MAX_STAGE} stages. You are now Retired with total earnings.`
        : `You have advanced to Stage ${newStage}. Stage bonus of ₹${bonus} has been credited.`,
      metadata: { fromStage: currentStage, toStage: newStage, bonus, activeCount },
    }).catch(() => {});

    // Recursively check the user's ancestors (their stage might also advance)
    setImmediate(() => checkAncestorsStage(userId).catch(() => {}));

    return {
      advanced:    true,
      fromStage:   currentStage,
      toStage:     newStage,
      bonus,
      isRetired,
      activeCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('checkAndAdvanceStage error', { userId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cascade stage check to all ancestors of a newly activated user.
 */
async function checkAncestorsStage(userId) {
  const ancestorsResult = await query(
    `SELECT ancestor_id FROM tree_closure WHERE descendant_id = $1 AND depth > 0 ORDER BY depth ASC`,
    [userId]
  );

  for (const row of ancestorsResult.rows) {
    try {
      const result = await checkAndAdvanceStage(row.ancestor_id);
      if (result.advanced) {
        logger.info('Ancestor stage advanced', {
          ancestorId: row.ancestor_id,
          toStage:    result.toStage,
        });
      }
    } catch (err) {
      logger.error('Ancestor stage check failed', { ancestorId: row.ancestor_id, error: err.message });
    }
  }
}

/**
 * Retire a user (called when Stage 13 complete).
 */
async function retireUser(client, userId) {
  await client.query(
    `UPDATE users SET is_retired = TRUE, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
  logger.info('User retired', { userId });
}

// ── Batch stage check (daily scheduler) ───────────────────────────

/**
 * Process stage validations in batches (for scheduler).
 * Runs through all active, non-retired users in batches of batchSize.
 *
 * @param {number} batchSize
 * @returns {object} { processed, advanced, errors }
 */
async function batchStageValidation(batchSize = 2000) {
  let offset = 0;
  let processed = 0, advanced = 0, errors = 0;

  logger.info('Starting batch stage validation', { batchSize });

  while (true) {
    const batchResult = await query(
      `SELECT id FROM users
       WHERE is_active = TRUE AND is_retired = FALSE
       ORDER BY current_stage DESC, last_upgrade_date ASC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (!batchResult.rowCount) break;

    const users = batchResult.rows;

    for (const user of users) {
      try {
        const result = await checkAndAdvanceStage(user.id);
        if (result.advanced) advanced++;
        processed++;
      } catch (err) {
        errors++;
        logger.error('Batch stage check error', { userId: user.id, error: err.message });
      }
    }

    if (batchResult.rowCount < batchSize) break;
    offset += batchSize;
  }

  logger.info('Batch stage validation complete', { processed, advanced, errors });
  return { processed, advanced, errors };
}

// ── Stage progress for dashboard ──────────────────────────────────

async function getStageProgress(userId) {
  const [userResult, stageConfigs] = await Promise.all([
    query(
      `SELECT current_stage, is_active, is_retired,
              (SELECT COUNT(DISTINCT descendant_id)
               FROM tree_closure tc JOIN users u2 ON u2.id = tc.descendant_id
               WHERE tc.ancestor_id = users.id AND tc.depth > 0 AND u2.is_active) AS active_count
       FROM users WHERE id = $1`,
      [userId]
    ),
    query('SELECT * FROM stage_config ORDER BY stage'),
  ]);

  if (!userResult.rowCount) return null;

  const user       = userResult.rows[0];
  const activeCount = parseInt(user.active_count || '0', 10);
  const nextStage   = user.current_stage + 1;

  const currentStageConfig = stageConfigs.rows.find(s => s.stage === user.current_stage);
  const nextStageConfig    = stageConfigs.rows.find(s => s.stage === nextStage);

  const required  = nextStageConfig?.required_members || 0;
  const progress  = required > 0 ? Math.min(Math.round((activeCount / required) * 100), 100) : 100;

  return {
    currentStage:      user.current_stage,
    isRetired:         user.is_retired,
    activeMembers:     activeCount,
    nextStage:         nextStageConfig ? nextStage : null,
    requiredForNext:   required,
    progress,
    stageConfig:       currentStageConfig,
    nextStageConfig,
    allStages:         stageConfigs.rows,
  };
}

module.exports = {
  checkAndAdvanceStage,
  checkAncestorsStage,
  batchStageValidation,
  getStageProgress,
};
