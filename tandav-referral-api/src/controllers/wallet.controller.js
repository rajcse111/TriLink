const { query }              = require('../config/database');
const { success, badRequest, notFound } = require('../utils/response');
const { validate, withdrawalSchema }    = require('../utils/validators');
const { comparePassword }              = require('../utils/crypto');
const { createWithdrawalRequest }      = require('../services/payment.service');

// ── Wallet Balance ─────────────────────────────────────────────────

async function getWalletBalance(req, res) {
  const result = await query(
    `SELECT w.balance, w.total_earned, w.total_withdrawn,
            (w.total_earned - w.total_withdrawn) AS net_earnings
     FROM wallets w WHERE w.user_id = $1`,
    [req.user.id]
  );
  if (!result.rowCount) return success(res, { balance: 0, total_earned: 0, total_withdrawn: 0 });
  return success(res, result.rows[0]);
}

// ── Transaction History ────────────────────────────────────────────

async function getTransactionHistory(req, res) {
  const page   = parseInt(req.query.page  || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const type   = req.query.type || null;
  const offset = (page - 1) * limit;

  const params  = [req.user.id];
  let sql       = `SELECT * FROM transactions WHERE user_id = $1`;
  let countSql  = `SELECT COUNT(*) FROM transactions WHERE user_id = $1`;
  if (type)     { sql += ` AND type = $2`; countSql += ` AND type = $2`; params.push(type); }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  const [data, cnt] = await Promise.all([
    query(sql, [...params, limit, offset]),
    query(countSql, params),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

// ── Withdrawal ─────────────────────────────────────────────────────

async function requestWithdrawal(req, res) {
  const { error: valErr, value } = validate(withdrawalSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  // KYC must be verified
  const userResult = await query(
    `SELECT is_kyc_verified, transaction_password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!userResult.rowCount) return notFound(res, 'User not found');

  const user = userResult.rows[0];
  if (!user.is_kyc_verified) {
    return badRequest(res, 'KYC verification required before withdrawal. Please update your KYC.');
  }

  // Verify transaction password
  const txnValid = await comparePassword(value.transaction_password, user.transaction_password_hash);
  if (!txnValid) return badRequest(res, 'Invalid transaction password');

  try {
    const withdrawalId = await createWithdrawalRequest(
      req.user.id, value.amount, value.bank_detail_id, value.transaction_password
    );
    return success(res, { withdrawalId }, 'Withdrawal request submitted successfully. Processing within 3-5 business days.');
  } catch (err) {
    return badRequest(res, err.message);
  }
}

async function getWithdrawalHistory(req, res) {
  const page   = parseInt(req.query.page  || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const offset = (page - 1) * limit;

  const [data, cnt] = await Promise.all([
    query(
      `SELECT wr.id, wr.amount, wr.status, wr.created_at, wr.processed_at, wr.admin_note,
              bd.bank_name, bd.account_number, bd.ifsc_code
       FROM withdrawal_requests wr
       LEFT JOIN bank_details bd ON bd.id = wr.bank_detail_id
       WHERE wr.user_id = $1
       ORDER BY wr.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = $1`, [req.user.id]),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

module.exports = {
  getWalletBalance,
  getTransactionHistory,
  requestWithdrawal,
  getWithdrawalHistory,
};
