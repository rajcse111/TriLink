/**
 * Payment & Income Service
 * ========================
 * Handles:
 *  - Level income distribution (when a user activates)
 *  - Stage completion bonus
 *  - Wallet credit/debit (all within DB transactions)
 *  - Complete auditable ledger
 */

const { getClient, query }        = require('../config/database');
const notificationService          = require('./notification.service');
const logger                       = require('../utils/logger');

const ACTIVATION_FEE = parseFloat(process.env.ACTIVATION_FEE || '100');

// ── Level Income Config (loaded from DB on first use) ──────────────
let _levelIncomeConfig = null;
async function getLevelIncomeConfig() {
  if (_levelIncomeConfig) return _levelIncomeConfig;
  // Use Stage 1's config as baseline (all stages share same level income rates)
  const result = await query('SELECT level_income FROM stage_config WHERE stage = 1');
  if (result.rowCount) {
    _levelIncomeConfig = result.rows[0].level_income;
  } else {
    _levelIncomeConfig = { '1': 40, '2': 20, '3': 10, '4': 5, '5': 2 };
  }
  return _levelIncomeConfig;
}

// ── Core: Distribute income when user activates ────────────────────

/**
 * Called after a new user successfully activates.
 * Distributes level income to all upline ancestors up to max configured levels.
 *
 * @param {string} newUserId - The newly activated user
 */
async function distributeActivationIncome(newUserId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const levelConfig = await getLevelIncomeConfig();
    const maxLevel    = Math.max(...Object.keys(levelConfig).map(Number));

    // Get ancestors up to maxLevel depth
    const ancestorsResult = await client.query(
      `SELECT tc.ancestor_id AS id, tc.depth AS level, u.is_active, u.is_retired
       FROM tree_closure tc
       JOIN users u ON u.id = tc.ancestor_id
       WHERE tc.descendant_id = $1 AND tc.depth BETWEEN 1 AND $2
       ORDER BY tc.depth ASC`,
      [newUserId, maxLevel]
    );

    for (const ancestor of ancestorsResult.rows) {
      if (!ancestor.is_active) continue;  // Skip inactive ancestors
      if (ancestor.is_retired) continue;

      const incomeRate = levelConfig[String(ancestor.level)];
      if (!incomeRate || incomeRate <= 0) continue;

      const amount = parseFloat(incomeRate);

      await creditWallet(client, ancestor.id, amount, {
        type:        'level_income',
        description: `Level ${ancestor.level} income from new activation`,
        fromUserId:  newUserId,
        level:       ancestor.level,
      });

      // Record income
      await client.query(
        `INSERT INTO income_records (user_id, from_user_id, income_type, amount, level, description)
         VALUES ($1, $2, 'level_income', $3, $4, $5)`,
        [ancestor.id, newUserId, amount, ancestor.level, `Level ${ancestor.level} income`]
      );
    }

    await client.query('COMMIT');
    logger.info('Activation income distributed', { newUserId, levels: ancestorsResult.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('distributeActivationIncome failed', { newUserId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

// ── Stage Completion Bonus ─────────────────────────────────────────

/**
 * Credit stage completion bonus to the user.
 */
async function creditStageBonus(userId, stage, nodesCount) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const stageResult = await client.query(
      'SELECT stage_bonus, name FROM stage_config WHERE stage = $1',
      [stage]
    );

    if (!stageResult.rowCount) throw new Error(`Unknown stage: ${stage}`);

    const { stage_bonus: bonus, name } = stageResult.rows[0];
    if (!bonus || bonus <= 0) {
      await client.query('COMMIT');
      return 0;
    }

    await creditWallet(client, userId, bonus, {
      type:        'stage_bonus',
      description: `${name} completion bonus (${nodesCount} members)`,
      stage,
    });

    await client.query(
      `INSERT INTO income_records (user_id, income_type, amount, stage, description)
       VALUES ($1, 'stage_bonus', $2, $3, $4)`,
      [userId, bonus, stage, `Stage ${stage} completion bonus`]
    );

    await client.query('COMMIT');
    logger.info('Stage bonus credited', { userId, stage, bonus });
    return bonus;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('creditStageBonus failed', { userId, stage, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

// ── Wallet operations ──────────────────────────────────────────────

/**
 * Credit amount to user's wallet (must be called within a DB transaction).
 */
async function creditWallet(client, userId, amount, meta = {}) {
  // Get or create wallet
  let walletResult = await client.query(
    `SELECT id, balance, total_earned FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  if (!walletResult.rowCount) {
    await client.query(`INSERT INTO wallets (user_id) VALUES ($1)`, [userId]);
    walletResult = await client.query(
      `SELECT id, balance, total_earned FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
  }

  const wallet      = walletResult.rows[0];
  const balBefore   = parseFloat(wallet.balance);
  const balAfter    = balBefore + amount;
  const totalEarned = parseFloat(wallet.total_earned) + amount;

  await client.query(
    `UPDATE wallets SET balance = $1, total_earned = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [balAfter, totalEarned, userId]
  );

  // Ledger entry
  await client.query(
    `INSERT INTO transactions
     (user_id, type, amount, balance_before, balance_after, description, from_user_id, stage, level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId, meta.type || 'admin_credit', amount, balBefore, balAfter,
      meta.description || '', meta.fromUserId || null, meta.stage || null, meta.level || null
    ]
  );

  // Async notification (fire and forget)
  notificationService.notify(userId, 'earnings_credited', {
    title:   'Earnings Credited',
    message: `₹${amount.toFixed(2)} has been credited to your wallet. New balance: ₹${balAfter.toFixed(2)}`,
    metadata: { amount, type: meta.type },
  }).catch(() => {});
}

/**
 * Debit amount from wallet (withdrawal, etc.) - within a transaction.
 */
async function debitWallet(client, userId, amount, meta = {}) {
  const walletResult = await client.query(
    `SELECT id, balance, total_withdrawn FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  if (!walletResult.rowCount) throw new Error('Wallet not found');

  const wallet    = walletResult.rows[0];
  const balBefore = parseFloat(wallet.balance);

  if (balBefore < amount) {
    throw new Error(`Insufficient balance. Available: ₹${balBefore.toFixed(2)}`);
  }

  const balAfter       = balBefore - amount;
  const totalWithdrawn = parseFloat(wallet.total_withdrawn) + amount;

  await client.query(
    `UPDATE wallets SET balance = $1, total_withdrawn = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [balAfter, totalWithdrawn, userId]
  );

  // Ledger entry
  const txnResult = await client.query(
    `INSERT INTO transactions
     (user_id, type, amount, balance_before, balance_after, description, stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, meta.type || 'withdrawal', amount, balBefore, balAfter, meta.description || '', meta.stage || null]
  );

  return txnResult.rows[0].id;
}

// ── Withdrawal Request ─────────────────────────────────────────────

async function createWithdrawalRequest(userId, amount, bankDetailId, txnPassword) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Verify bank detail belongs to user
    const bankResult = await client.query(
      `SELECT id FROM bank_details WHERE id = $1 AND user_id = $2`,
      [bankDetailId, userId]
    );
    if (!bankResult.rowCount) throw new Error('Invalid bank account');

    // Check balance
    const walletResult = await client.query(
      `SELECT balance FROM wallets WHERE user_id = $1`,
      [userId]
    );
    if (!walletResult.rowCount || parseFloat(walletResult.rows[0].balance) < amount) {
      throw new Error('Insufficient balance');
    }

    // Debit wallet immediately (pending approval)
    const txnId = await debitWallet(client, userId, amount, {
      type:        'withdrawal',
      description: 'Withdrawal request submitted',
    });

    // Create withdrawal request
    const wrResult = await client.query(
      `INSERT INTO withdrawal_requests (user_id, amount, bank_detail_id, transaction_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [userId, amount, bankDetailId, txnId]
    );

    await client.query('COMMIT');
    return wrResult.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin approves a withdrawal request.
 */
async function approveWithdrawal(withdrawalId, adminId, note = '') {
  await query(
    `UPDATE withdrawal_requests
     SET status = 'processed', processed_by = $1, admin_note = $2, processed_at = NOW(), updated_at = NOW()
     WHERE id = $3 AND status = 'pending'`,
    [adminId, note, withdrawalId]
  );
}

/**
 * Admin rejects a withdrawal - reverse the debit.
 */
async function rejectWithdrawal(withdrawalId, adminId, reason) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const wrResult = await client.query(
      `SELECT user_id, amount, status FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [withdrawalId]
    );
    if (!wrResult.rowCount) throw new Error('Withdrawal request not found');

    const wr = wrResult.rows[0];
    if (wr.status !== 'pending') throw new Error('Only pending requests can be rejected');

    // Reverse the wallet debit
    await creditWallet(client, wr.user_id, parseFloat(wr.amount), {
      type:        'withdrawal_reversal',
      description: `Withdrawal rejected: ${reason}`,
    });

    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'rejected', processed_by = $1, admin_note = $2, processed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminId, reason, withdrawalId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Financial Reports ──────────────────────────────────────────────

async function getIncomeReport(userId, startDate, endDate) {
  const result = await query(
    `SELECT
       income_type,
       SUM(amount)   AS total_amount,
       COUNT(*)      AS count,
       MIN(created_at) AS first_date,
       MAX(created_at) AS last_date
     FROM income_records
     WHERE user_id = $1
       AND ($2::date IS NULL OR income_date >= $2)
       AND ($3::date IS NULL OR income_date <= $3)
     GROUP BY income_type
     ORDER BY total_amount DESC`,
    [userId, startDate || null, endDate || null]
  );
  return result.rows;
}

async function getDailyIncomeReport(userId, limit = 30) {
  const result = await query(
    `SELECT
       income_date AS date,
       SUM(amount) FILTER (WHERE income_type = 'level_income')  AS level_income,
       SUM(amount) FILTER (WHERE income_type = 'stage_bonus')   AS stage_bonus,
       SUM(amount)                                               AS total
     FROM income_records
     WHERE user_id = $1
     GROUP BY income_date
     ORDER BY income_date DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function getTransactionHistory(userId, { page = 1, limit = 20, type = null }) {
  const offset = (page - 1) * limit;
  const params = [userId];
  let sql = `SELECT * FROM transactions WHERE user_id = $1`;
  if (type) { sql += ` AND type = $2`; params.push(type); }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const countSql = `SELECT COUNT(*) FROM transactions WHERE user_id = $1${type ? ' AND type = $2' : ''}`;
  const [data, countResult] = await Promise.all([
    query(sql, params),
    query(countSql, type ? [userId, type] : [userId]),
  ]);

  return {
    data:  data.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

module.exports = {
  distributeActivationIncome,
  creditStageBonus,
  creditWallet,
  debitWallet,
  createWithdrawalRequest,
  approveWithdrawal,
  rejectWithdrawal,
  getIncomeReport,
  getDailyIncomeReport,
  getTransactionHistory,
};
