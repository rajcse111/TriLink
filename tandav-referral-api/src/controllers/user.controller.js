const { query, getClient }       = require('../config/database');
const { validate, updateProfileSchema, bankDetailSchema,
        activationSchema, changeTxnPasswordSchema } = require('../utils/validators');
const { success, badRequest, notFound, conflict } = require('../utils/response');
const { comparePassword, hashPassword }           = require('../utils/crypto');
const { distributeActivationIncome }              = require('../services/payment.service');
const { checkAncestorsStage }                     = require('../services/stage.service');
const { getStageProgress }                        = require('../services/stage.service');
const { cacheGet, cacheSet, cacheDel }            = require('../config/redis');
const notificationService                         = require('../services/notification.service');
const logger                                      = require('../utils/logger');

// ── Dashboard ──────────────────────────────────────────────────────

async function getDashboard(req, res) {
  const userId   = req.user.id;
  const cacheKey = `dashboard:${userId}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return success(res, cached);

  const result = await query(
    `SELECT * FROM user_dashboard_view WHERE id = $1`,
    [userId]
  );
  if (!result.rowCount) return notFound(res, 'User not found');

  const data = result.rows[0];
  const stageProgress = await getStageProgress(userId);

  const dashboard = { ...data, stageProgress };
  await cacheSet(cacheKey, dashboard, 60);

  return success(res, dashboard);
}

// ── Profile ────────────────────────────────────────────────────────

async function getProfile(req, res) {
  const result = await query(
    `SELECT u.id, u.associate_id, u.referral_code, u.full_name, u.father_husband_name,
            u.date_of_birth, u.gender, u.marital_status, u.mobile, u.email,
            u.designation, u.current_stage, u.is_active, u.kyc_status, u.is_kyc_verified,
            u.profile_image_url, u.address, u.state, u.district, u.terms_accepted,
            u.registration_date, u.activation_date, u.last_upgrade_date,
            s.associate_id AS sponsor_associate_id, s.full_name AS sponsor_name, s.mobile AS sponsor_mobile,
            u.position AS tree_position
     FROM users u
     LEFT JOIN users s ON s.id = u.sponsor_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  if (!result.rowCount) return notFound(res, 'User not found');
  return success(res, result.rows[0]);
}

async function updateProfile(req, res) {
  const { error: valErr, value } = validate(updateProfileSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  if (value.email) {
    const dup = await query(
      `SELECT id FROM users WHERE email = $1 AND id != $2`,
      [value.email, req.user.id]
    );
    if (dup.rowCount) return conflict(res, 'Email already in use');
  }

  const fields = Object.keys(value).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals   = Object.values(value);

  await query(
    `UPDATE users SET ${fields}, updated_at = NOW() WHERE id = $1`,
    [req.user.id, ...vals]
  );

  await cacheDel(`dashboard:${req.user.id}`);
  return success(res, null, 'Profile updated successfully');
}

// ── Profile image ──────────────────────────────────────────────────

async function uploadProfileImage(req, res) {
  if (!req.file) return badRequest(res, 'No image file provided');

  const imageUrl = `/uploads/${req.file.filename}`;
  await query(
    `UPDATE users SET profile_image_url = $1, updated_at = NOW() WHERE id = $2`,
    [imageUrl, req.user.id]
  );
  await cacheDel(`dashboard:${req.user.id}`);
  return success(res, { profileImageUrl: imageUrl }, 'Profile image updated');
}

// ── KYC ───────────────────────────────────────────────────────────

async function submitKYC(req, res) {
  const { document_type, document_number } = req.body;
  if (!document_type) return badRequest(res, 'Document type required');

  const files = req.files || {};
  const frontUrl = files.front_image?.[0] ? `/uploads/${files.front_image[0].filename}` : null;
  const backUrl  = files.back_image?.[0]  ? `/uploads/${files.back_image[0].filename}`  : null;

  // Deactivate any previous pending KYC for same doc type
  await query(
    `UPDATE kyc_documents SET status = 'rejected', rejection_reason = 'Superseded by new submission'
     WHERE user_id = $1 AND document_type = $2 AND status IN ('pending','under_review')`,
    [req.user.id, document_type]
  );

  await query(
    `INSERT INTO kyc_documents (user_id, document_type, document_number, front_image_url, back_image_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.id, document_type, document_number || null, frontUrl, backUrl]
  );

  await query(
    `UPDATE users SET kyc_status = 'submitted', updated_at = NOW() WHERE id = $1`,
    [req.user.id]
  );

  return success(res, null, 'KYC documents submitted for verification');
}

async function getKYCStatus(req, res) {
  const result = await query(
    `SELECT id, document_type, document_number, front_image_url, back_image_url,
            status, rejection_reason, verified_at, created_at
     FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  return success(res, result.rows);
}

// ── Bank Details ───────────────────────────────────────────────────

async function getBankDetails(req, res) {
  const result = await query(
    `SELECT id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, is_primary, created_at
     FROM bank_details WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC`,
    [req.user.id]
  );
  return success(res, result.rows);
}

async function addBankDetail(req, res) {
  const { error: valErr, value } = validate(bankDetailSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (value.is_primary) {
      await client.query(
        `UPDATE bank_details SET is_primary = FALSE WHERE user_id = $1`,
        [req.user.id]
      );
    }

    const result = await client.query(
      `INSERT INTO bank_details (user_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, value.account_holder_name, value.account_number, value.ifsc_code, value.bank_name, value.branch_name || null, value.is_primary]
    );

    await client.query('COMMIT');
    return success(res, { id: result.rows[0].id }, 'Bank details added');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Add bank detail failed', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to add bank details' });
  } finally {
    client.release();
  }
}

async function deleteBankDetail(req, res) {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM bank_details WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, req.user.id]
  );
  if (!result.rowCount) return notFound(res, 'Bank detail not found');
  return success(res, null, 'Bank detail removed');
}

// ── Account Activation ─────────────────────────────────────────────

async function activateAccount(req, res) {
  const userId = req.user.id;

  // Check if already active
  const userResult = await query(
    `SELECT is_active, transaction_password_hash FROM users WHERE id = $1`,
    [userId]
  );
  if (!userResult.rowCount) return notFound(res, 'User not found');

  const user = userResult.rows[0];
  if (user.is_active) return badRequest(res, 'Account is already active');

  const { error: valErr, value } = validate(activationSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  // Verify transaction password
  const txnValid = await comparePassword(value.transaction_password, user.transaction_password_hash);
  if (!txnValid) return badRequest(res, 'Invalid transaction password');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET is_active = TRUE, current_stage = 1, activation_date = NOW(),
       last_upgrade_date = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Ensure wallet exists
    await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Log activation transaction (user paid ₹100)
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description)
       VALUES ($1, 'activation', $2, 0, 0, 'Account activation payment')`,
      [userId, parseFloat(process.env.ACTIVATION_FEE || '100')]
    );

    await client.query('COMMIT');

    // Distribute level income to upline (async - non-blocking)
    setImmediate(async () => {
      try {
        await distributeActivationIncome(userId);
        await checkAncestorsStage(userId);
      } catch (err) {
        logger.error('Post-activation processing failed', { userId, error: err.message });
      }
    });

    await cacheDel(`dashboard:${userId}`);

    return success(res, null, 'Account activated successfully! Welcome to TriLink Network.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Activation failed', { userId, error: err.message });
    return res.status(500).json({ success: false, message: 'Activation failed. Please try again.' });
  } finally {
    client.release();
  }
}

// ── Change transaction password ────────────────────────────────────

async function changeTransactionPassword(req, res) {
  const { error: valErr, value } = validate(changeTxnPasswordSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const { verifyOTPCode }  = require('../services/otp.service');
  const userResult = await query(
    `SELECT mobile, transaction_password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!userResult.rowCount) return notFound(res, 'User not found');

  const user = userResult.rows[0];

  // Verify current transaction password
  const valid = await comparePassword(value.current_txn_password, user.transaction_password_hash);
  if (!valid) return badRequest(res, 'Invalid current transaction password');

  // Verify OTP
  const otpCheck = await verifyOTPCode(user.mobile, value.otp, 'transaction');
  if (!otpCheck.valid) return badRequest(res, otpCheck.error);

  const newHash = await hashPassword(value.new_txn_password);
  await query(
    `UPDATE users SET transaction_password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newHash, req.user.id]
  );

  return success(res, null, 'Transaction password changed successfully');
}

// ── Welcome letter / ID card ───────────────────────────────────────

async function getWelcomeLetter(req, res) {
  const result = await query(
    `SELECT u.full_name, u.associate_id, u.mobile, u.email, u.designation,
            u.registration_date, u.activation_date, u.current_stage, u.referral_code,
            s.full_name AS sponsor_name, s.associate_id AS sponsor_id,
            u.address, u.state, u.district
     FROM users u
     LEFT JOIN users s ON s.id = u.sponsor_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  if (!result.rowCount) return notFound(res, 'User not found');
  return success(res, { welcomeLetter: result.rows[0] });
}

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  uploadProfileImage,
  submitKYC,
  getKYCStatus,
  getBankDetails,
  addBankDetail,
  deleteBankDetail,
  activateAccount,
  changeTransactionPassword,
  getWelcomeLetter,
};
