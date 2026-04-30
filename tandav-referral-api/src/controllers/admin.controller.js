const { query, getClient }      = require('../config/database');
const jwt                       = require('jsonwebtoken');
const bcrypt                    = require('bcryptjs');
const { success, created, badRequest, notFound, unauthorized, conflict } = require('../utils/response');
const { validate, meetingSchema, paginationSchema } = require('../utils/validators');
const { approveWithdrawal, rejectWithdrawal, creditWallet } = require('../services/payment.service');
const { checkAndAdvanceStage }  = require('../services/stage.service');
const { runDailyBatch }         = require('../services/scheduler.service');
const logger                    = require('../utils/logger');

// ── Admin login ────────────────────────────────────────────────────

async function adminLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return badRequest(res, 'Email and password required');

  const result = await query(
    `SELECT id, username, email, password_hash, role, is_active FROM admins WHERE email = $1`,
    [email.toLowerCase()]
  );
  if (!result.rowCount) return unauthorized(res, 'Invalid credentials');

  const admin = result.rows[0];
  if (!admin.is_active) return unauthorized(res, 'Admin account is disabled');

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return unauthorized(res, 'Invalid credentials');

  await query(`UPDATE admins SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

  const token = jwt.sign(
    { id: admin.id, role: admin.role, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return success(res, {
    token,
    admin: { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
  });
}

// ── Users management ───────────────────────────────────────────────

async function getUsers(req, res) {
  const page   = parseInt(req.query.page   || '1', 10);
  const limit  = parseInt(req.query.limit  || '20', 10);
  const search = req.query.search || '';
  const status = req.query.status;   // 'active' | 'inactive' | 'retired'
  const stage  = req.query.stage;
  const offset = (page - 1) * limit;

  const params = [];
  let where    = 'WHERE 1=1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.full_name ILIKE $${params.length} OR u.mobile LIKE $${params.length} OR u.associate_id ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }
  if (status === 'active')   { where += ` AND u.is_active = TRUE AND u.is_retired = FALSE`; }
  if (status === 'inactive') { where += ` AND u.is_active = FALSE`; }
  if (status === 'retired')  { where += ` AND u.is_retired = TRUE`; }
  if (stage)                 { params.push(parseInt(stage, 10)); where += ` AND u.current_stage = $${params.length}`; }

  const [data, cnt] = await Promise.all([
    query(
      `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.email, u.designation,
              u.current_stage, u.is_active, u.is_kyc_verified, u.kyc_status, u.is_retired,
              u.registration_date, u.activation_date,
              u.position, s.full_name AS sponsor_name,
              COALESCE(w.balance, 0) AS wallet_balance,
              COALESCE(w.total_earned, 0) AS total_earned
       FROM users u
       LEFT JOIN users s  ON s.id  = u.sponsor_id
       LEFT JOIN wallets w ON w.user_id = u.id
       ${where}
       ORDER BY u.registration_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM users u ${where}`, params),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

async function getUserDetail(req, res) {
  const { id } = req.params;
  const result = await query(
    `SELECT u.*, s.full_name AS sponsor_name, s.associate_id AS sponsor_associate_id,
            COALESCE(w.balance, 0) AS wallet_balance,
            COALESCE(w.total_earned, 0) AS total_earned,
            COALESCE(w.total_withdrawn, 0) AS total_withdrawn
     FROM users u
     LEFT JOIN users s  ON s.id  = u.sponsor_id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  if (!result.rowCount) return notFound(res, 'User not found');
  return success(res, result.rows[0]);
}

async function activateUser(req, res) {
  const { id } = req.params;
  const { note = '' } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT is_active FROM users WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!userResult.rowCount) { await client.query('ROLLBACK'); return notFound(res, 'User not found'); }
    if (userResult.rows[0].is_active) { await client.query('ROLLBACK'); return badRequest(res, 'User already active'); }

    await client.query(
      `UPDATE users SET is_active = TRUE, current_stage = 1,
       activation_date = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [id]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description)
       VALUES ($1, 'activation', 100, 0, 0, $2)`,
      [id, `Admin activated: ${note}`]
    );

    await client.query('COMMIT');

    // Distribute income and check stages
    const { distributeActivationIncome } = require('../services/payment.service');
    const { checkAncestorsStage }        = require('../services/stage.service');
    setImmediate(async () => {
      try {
        await distributeActivationIncome(id);
        await checkAncestorsStage(id);
      } catch (err) {
        logger.error('Post admin-activation processing failed', { id, error: err.message });
      }
    });

    return success(res, null, 'User activated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Admin activate user failed', { id, error: err.message });
    return res.status(500).json({ success: false, message: 'Activation failed' });
  } finally {
    client.release();
  }
}

async function deactivateUser(req, res) {
  const { id } = req.params;
  const { reason = '' } = req.body;

  const result = await query(
    `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rowCount) return notFound(res, 'User not found');
  logger.info('Admin deactivated user', { userId: id, adminId: req.admin.id, reason });
  return success(res, null, 'User deactivated');
}

async function adminCreditWallet(req, res) {
  const { id } = req.params;
  const { amount, note } = req.body;

  if (!amount || amount <= 0) return badRequest(res, 'Valid amount required');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await creditWallet(client, id, parseFloat(amount), {
      type:        'admin_credit',
      description: `Admin credit: ${note || 'Manual adjustment'}`,
    });
    await client.query('COMMIT');
    return success(res, null, `₹${amount} credited to user wallet`);
  } catch (err) {
    await client.query('ROLLBACK');
    return badRequest(res, err.message);
  } finally {
    client.release();
  }
}

// ── KYC management ─────────────────────────────────────────────────

async function getPendingKYC(req, res) {
  const result = await query(
    `SELECT kd.*, u.full_name, u.associate_id, u.mobile
     FROM kyc_documents kd
     JOIN users u ON u.id = kd.user_id
     WHERE kd.status IN ('pending','under_review')
     ORDER BY kd.created_at ASC`,
    []
  );
  return success(res, result.rows);
}

async function verifyKYC(req, res) {
  const { id } = req.params;
  const { action, reason = '' } = req.body;  // action: 'approve' | 'reject'

  const kycResult = await query(
    `SELECT user_id FROM kyc_documents WHERE id = $1`,
    [id]
  );
  if (!kycResult.rowCount) return notFound(res, 'KYC document not found');

  const userId = kycResult.rows[0].user_id;

  if (action === 'approve') {
    await query(
      `UPDATE kyc_documents SET status = 'verified', verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.admin.id, id]
    );
    await query(
      `UPDATE users SET kyc_status = 'verified', is_kyc_verified = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } else if (action === 'reject') {
    await query(
      `UPDATE kyc_documents SET status = 'rejected', rejection_reason = $1, verified_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [reason, req.admin.id, id]
    );
    await query(
      `UPDATE users SET kyc_status = 'rejected', is_kyc_verified = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } else {
    return badRequest(res, 'Invalid action. Use approve or reject.');
  }

  const notificationService = require('../services/notification.service');
  notificationService.notify(userId, action === 'approve' ? 'kyc_verified' : 'kyc_rejected', {
    title:   action === 'approve' ? 'KYC Verified' : 'KYC Rejected',
    message: action === 'approve' ? 'Your KYC has been verified. You can now request withdrawals.' : `KYC rejected: ${reason}`,
  }).catch(() => {});

  return success(res, null, `KYC ${action}d successfully`);
}

// ── Withdrawal management ──────────────────────────────────────────

async function getPendingWithdrawals(req, res) {
  const page   = parseInt(req.query.page  || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const offset = (page - 1) * limit;

  const [data, cnt] = await Promise.all([
    query(
      `SELECT wr.*, u.full_name, u.associate_id, u.mobile,
              bd.bank_name, bd.account_number, bd.ifsc_code, bd.account_holder_name
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       LEFT JOIN bank_details bd ON bd.id = wr.bank_detail_id
       WHERE wr.status = 'pending'
       ORDER BY wr.created_at ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'`),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

async function processWithdrawal(req, res) {
  const { id } = req.params;
  const { action, note = '' } = req.body;  // action: 'approve' | 'reject'

  try {
    if (action === 'approve') {
      await approveWithdrawal(id, req.admin.id, note);
      return success(res, null, 'Withdrawal approved');
    } else if (action === 'reject') {
      await rejectWithdrawal(id, req.admin.id, note);
      return success(res, null, 'Withdrawal rejected and amount reversed');
    } else {
      return badRequest(res, 'Invalid action');
    }
  } catch (err) {
    return badRequest(res, err.message);
  }
}

// ── Meetings management ────────────────────────────────────────────

async function createMeeting(req, res) {
  const { error: valErr, value } = validate(meetingSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const result = await query(
    `INSERT INTO meetings (meeting_date, meeting_time, meeting_type, contact_person, mobile_no, email, venue, city, state, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [value.meeting_date, value.meeting_time, value.meeting_type, value.contact_person, value.mobile_no, value.email, value.venue, value.city, value.state, value.description, req.admin.id]
  );
  return created(res, { id: result.rows[0].id }, 'Meeting created');
}

async function updateMeeting(req, res) {
  const { id } = req.params;
  const { error: valErr, value } = validate(meetingSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const result = await query(
    `UPDATE meetings SET meeting_date=$1, meeting_time=$2, meeting_type=$3, contact_person=$4,
     mobile_no=$5, email=$6, venue=$7, city=$8, state=$9, description=$10, updated_at=NOW()
     WHERE id = $11 RETURNING id`,
    [value.meeting_date, value.meeting_time, value.meeting_type, value.contact_person, value.mobile_no, value.email, value.venue, value.city, value.state, value.description, id]
  );
  if (!result.rowCount) return notFound(res, 'Meeting not found');
  return success(res, null, 'Meeting updated');
}

async function deleteMeeting(req, res) {
  await query(`UPDATE meetings SET is_active = FALSE WHERE id = $1`, [req.params.id]);
  return success(res, null, 'Meeting removed');
}

// ── Complaints management ──────────────────────────────────────────

async function getAllComplaints(req, res) {
  const page   = parseInt(req.query.page  || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const status = req.query.status || 'open';
  const offset = (page - 1) * limit;

  const [data, cnt] = await Promise.all([
    query(
      `SELECT c.*, u.full_name, u.associate_id, u.mobile
       FROM complaints c JOIN users u ON u.id = c.user_id
       WHERE c.status = $1
       ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM complaints WHERE status = $1`, [status]),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

async function respondToComplaint(req, res) {
  const { id }                  = req.params;
  const { response, status = 'resolved' } = req.body;
  if (!response) return badRequest(res, 'Response message required');

  const result = await query(
    `UPDATE complaints SET status=$1, admin_response=$2, resolved_by=$3, resolved_at=NOW(), updated_at=NOW()
     WHERE id = $4 RETURNING user_id`,
    [status, response, req.admin.id, id]
  );
  if (!result.rowCount) return notFound(res, 'Complaint not found');
  return success(res, null, 'Complaint responded');
}

// ── Reports ────────────────────────────────────────────────────────

async function getReports(req, res) {
  const { type = 'overview' } = req.query;

  if (type === 'user_growth') {
    const result = await query(
      `SELECT DATE(registration_date) AS date, COUNT(*) AS registered,
              COUNT(*) FILTER (WHERE is_active) AS activated
       FROM users GROUP BY DATE(registration_date) ORDER BY date DESC LIMIT 30`
    );
    return success(res, result.rows);
  }

  if (type === 'revenue') {
    const result = await query(
      `SELECT DATE(created_at) AS date,
              SUM(amount) FILTER (WHERE type = 'activation') AS activation_revenue,
              SUM(amount) FILTER (WHERE type = 'level_income') AS level_income_paid,
              SUM(amount) FILTER (WHERE type = 'stage_bonus') AS stage_bonus_paid,
              SUM(amount) FILTER (WHERE type = 'withdrawal') AS withdrawals
       FROM transactions
       GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`
    );
    return success(res, result.rows);
  }

  if (type === 'stage_completion') {
    const result = await query(
      `SELECT to_stage AS stage, COUNT(*) AS completions,
              SUM(income_credited) AS total_bonus_paid,
              AVG(nodes_count) AS avg_nodes
       FROM stage_history GROUP BY to_stage ORDER BY to_stage`
    );
    return success(res, result.rows);
  }

  // Overview
  const [totals, stageDistrib, recentTransactions] = await Promise.all([
    query(`SELECT
      COUNT(*) AS total_users,
      COUNT(*) FILTER (WHERE is_active) AS active_users,
      COUNT(*) FILTER (WHERE is_retired) AS retired_users,
      COUNT(*) FILTER (WHERE NOT is_active) AS inactive_users,
      COUNT(*) FILTER (WHERE kyc_status = 'verified') AS kyc_verified
    FROM users`),
    query(`SELECT current_stage AS stage, COUNT(*) AS count FROM users WHERE is_active GROUP BY stage ORDER BY stage`),
    query(`SELECT SUM(balance) AS total_wallet, SUM(total_earned) AS total_earned, SUM(total_withdrawn) AS total_withdrawn FROM wallets`),
  ]);

  return success(res, {
    users:        totals.rows[0],
    stageDistrib: stageDistrib.rows,
    financials:   recentTransactions.rows[0],
  });
}

// ── Manual batch trigger ───────────────────────────────────────────

async function triggerBatch(req, res) {
  try {
    const result = await runDailyBatch();
    return success(res, result, 'Batch processing completed');
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ── Batch logs ─────────────────────────────────────────────────────

async function getBatchLogs(req, res) {
  const result = await query(
    `SELECT * FROM batch_logs ORDER BY started_at DESC LIMIT 50`
  );
  return success(res, result.rows);
}

module.exports = {
  adminLogin,
  getUsers, getUserDetail, activateUser, deactivateUser, adminCreditWallet,
  getPendingKYC, verifyKYC,
  getPendingWithdrawals, processWithdrawal,
  createMeeting, updateMeeting, deleteMeeting,
  getAllComplaints, respondToComplaint,
  getReports, triggerBatch, getBatchLogs,
};
