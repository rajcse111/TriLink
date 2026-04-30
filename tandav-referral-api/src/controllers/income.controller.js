const { query }          = require('../config/database');
const { success }        = require('../utils/response');
const { getDailyIncomeReport, getIncomeReport } = require('../services/payment.service');

// ── Level Income Summary ───────────────────────────────────────────

async function getLevelIncomeSummary(req, res) {
  const result = await query(
    `SELECT
       level,
       COUNT(*)       AS transactions,
       SUM(amount)    AS total_income,
       MAX(created_at) AS last_received
     FROM income_records
     WHERE user_id = $1 AND income_type = 'level_income'
     GROUP BY level
     ORDER BY level`,
    [req.user.id]
  );
  return success(res, result.rows);
}

// ── Daily Income Report ────────────────────────────────────────────

async function getDailyIncome(req, res) {
  const limit  = parseInt(req.query.limit || '30', 10);
  const page   = parseInt(req.query.page  || '1', 10);
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT
       income_date AS date,
       SUM(amount) FILTER (WHERE income_type = 'level_income')  AS level_income,
       SUM(amount) FILTER (WHERE income_type = 'stage_bonus')   AS stage_bonus,
       SUM(amount)                                               AS total,
       COUNT(*)                                                  AS transactions
     FROM income_records
     WHERE user_id = $1
     GROUP BY income_date
     ORDER BY income_date DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(DISTINCT income_date) FROM income_records WHERE user_id = $1`,
    [req.user.id]
  );

  return res.json({
    success: true,
    data: result.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count, 10),
      page, limit,
    },
  });
}

// ── Overall Income Report ──────────────────────────────────────────

async function getIncomeOverview(req, res) {
  const { start_date, end_date } = req.query;

  const [byType, wallet] = await Promise.all([
    getIncomeReport(req.user.id, start_date || null, end_date || null),
    query(`SELECT total_earned, total_withdrawn, balance FROM wallets WHERE user_id = $1`, [req.user.id]),
  ]);

  return success(res, {
    incomeByType: byType,
    wallet:       wallet.rows[0] || { total_earned: 0, total_withdrawn: 0, balance: 0 },
  });
}

// ── Income History (paginated) ─────────────────────────────────────

async function getIncomeHistory(req, res) {
  const page   = parseInt(req.query.page  || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const type   = req.query.type;
  const offset = (page - 1) * limit;

  const params = [req.user.id];
  let sql      = `SELECT ir.*, u.full_name AS from_name, u.associate_id AS from_associate_id
                  FROM income_records ir
                  LEFT JOIN users u ON u.id = ir.from_user_id
                  WHERE ir.user_id = $1`;
  let countSql = `SELECT COUNT(*) FROM income_records WHERE user_id = $1`;

  if (type) {
    sql      += ` AND ir.income_type = $2`;
    countSql += ` AND income_type = $2`;
    params.push(type);
  }

  sql += ` ORDER BY ir.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

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

module.exports = {
  getLevelIncomeSummary,
  getDailyIncome,
  getIncomeOverview,
  getIncomeHistory,
};
