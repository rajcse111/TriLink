const { query, getClient }     = require('../config/database');
const { generateReferralCode, hashPassword, comparePassword,
        signToken, signRefreshToken, verifyRefreshToken,
        buildDeviceFingerprint }      = require('../utils/crypto');
const { validate, registerSchema, loginWithPasswordSchema,
        loginWithOTPSchema, verifyOTPSchema, changePasswordSchema,
        forgotPasswordSchema, resetPasswordSchema } = require('../utils/validators');
const { success, created, badRequest, unauthorized, conflict, notFound } = require('../utils/response');
const { sendOTP, verifyOTPCode }       = require('../services/otp.service');
const { placeUserInTree, validateReferralCode } = require('../services/referral.service');
const { distributeActivationIncome }   = require('../services/payment.service');
const { checkAncestorsStage }          = require('../services/stage.service');
const { logAction }                    = require('../middleware/fraud.middleware');
const notificationService              = require('../services/notification.service');
const logger                           = require('../utils/logger');

// ── Register ───────────────────────────────────────────────────────

async function register(req, res) {
  const { error: valErr, value } = validate(registerSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const { mobile, email, password, transaction_password,
          referral_code, position, full_name, ...rest } = value;

  // Validate referral code
  const refCheck = await validateReferralCode(referral_code);
  if (!refCheck.valid) return badRequest(res, refCheck.error);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Check duplicates
    const dupResult = await client.query(
      `SELECT id FROM users WHERE mobile = $1 OR ($2::text IS NOT NULL AND email = $2)`,
      [mobile, email || null]
    );
    if (dupResult.rowCount) {
      await client.query('ROLLBACK');
      return conflict(res, 'Mobile number or email already registered');
    }

    // Generate unique IDs
    const referralCode = generateReferralCode(8);

    // Generate unique associate ID using DB function
    const assocResult = await client.query(`SELECT generate_associate_id() AS aid`);
    const associateId = assocResult.rows[0].aid;

    // Hash passwords
    const [pwdHash, txnPwdHash] = await Promise.all([
      hashPassword(password),
      hashPassword(transaction_password),
    ]);

    // Insert user
    const insertResult = await client.query(
      `INSERT INTO users (
         associate_id, referral_code, full_name, father_husband_name,
         date_of_birth, gender, marital_status, mobile, email,
         password_hash, transaction_password_hash,
         address, state, district, terms_accepted,
         last_ip, device_fingerprint
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, associate_id, referral_code`,
      [
        associateId, referralCode, full_name, rest.father_husband_name || null,
        rest.date_of_birth || null, rest.gender || null, rest.marital_status || null,
        mobile, email || null, pwdHash, txnPwdHash,
        rest.address || null, rest.state || null, rest.district || null,
        value.terms_accepted,
        req.clientIp || req.ip, req.deviceFingerprint,
      ]
    );

    const newUser = insertResult.rows[0];

    // Create wallet
    await client.query(`INSERT INTO wallets (user_id) VALUES ($1)`, [newUser.id]);

    // Place in referral tree
    await placeUserInTree(client, newUser.id, refCheck.sponsor.id, position, true);

    await client.query('COMMIT');

    // Log registration
    await logAction(newUser.id, 'register', req.clientIp, req.deviceFingerprint);

    // Notify sponsor
    notificationService.notify(refCheck.sponsor.id, 'new_referral', {
      title:   'New Member Joined!',
      message: `${full_name} has joined your network (${position} position).`,
      metadata: { newUserId: newUser.id, position },
    }).catch(() => {});

    return created(res, {
      associateId:  newUser.associate_id,
      referralCode: newUser.referral_code,
      message:      'Registration successful. Please complete account activation.',
    }, 'Registration successful');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Registration failed', { mobile, error: err.message });
    if (err.message.includes('position')) return badRequest(res, err.message);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  } finally {
    client.release();
  }
}

// ── Login with password ────────────────────────────────────────────

async function loginWithPassword(req, res) {
  const { error: valErr, value } = validate(loginWithPasswordSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const { identifier, password } = value;
  const ip          = req.clientIp || req.ip;
  const fingerprint = req.deviceFingerprint;

  const result = await query(
    `SELECT id, password_hash, is_active, is_retired, token_version,
            associate_id, full_name, current_stage, mobile, failed_login_attempts, locked_until
     FROM users
     WHERE mobile = $1 OR email = $1`,
    [identifier.toLowerCase()]
  );

  if (!result.rowCount) {
    return unauthorized(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // Account lockout check
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(403).json({
      success: false,
      message: `Account locked until ${new Date(user.locked_until).toISOString()}`,
    });
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    // Increment failed attempts
    const attempts = (user.failed_login_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [attempts, lockUntil, user.id]
    );
    await logAction(user.id, 'failed_login', ip, fingerprint);
    return unauthorized(res, 'Invalid credentials');
  }

  // Reset failed attempts
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(),
     last_ip = $1, device_fingerprint = $2 WHERE id = $3`,
    [ip, fingerprint, user.id]
  );

  await logAction(user.id, 'login', ip, fingerprint);

  const tokenPayload = { id: user.id, tokenVersion: user.token_version };
  const accessToken  = signToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  return success(res, {
    accessToken,
    refreshToken,
    user: {
      id:          user.id,
      associateId: user.associate_id,
      fullName:    user.full_name,
      stage:       user.current_stage,
      isActive:    user.is_active,
      isRetired:   user.is_retired,
    },
  });
}

// ── Login - Send OTP ───────────────────────────────────────────────

async function sendLoginOTP(req, res) {
  const { error: valErr, value } = validate(loginWithOTPSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const exists = await query(`SELECT id FROM users WHERE mobile = $1`, [value.mobile]);
  if (!exists.rowCount) return notFound(res, 'Mobile number not registered');

  const result = await sendOTP(value.mobile, 'login');
  return success(res, result);
}

// ── Verify OTP & Login ─────────────────────────────────────────────

async function verifyLoginOTP(req, res) {
  const { error: valErr, value } = validate(verifyOTPSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const { mobile, otp } = value;
  const otpCheck = await verifyOTPCode(mobile, otp, 'login');
  if (!otpCheck.valid) return badRequest(res, otpCheck.error);

  const result = await query(
    `UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL
     WHERE mobile = $1
     RETURNING id, associate_id, full_name, current_stage, is_active, is_retired, token_version`,
    [mobile]
  );

  if (!result.rowCount) return notFound(res, 'User not found');

  const user = result.rows[0];
  const ip   = req.clientIp || req.ip;
  await logAction(user.id, 'login', ip, req.deviceFingerprint);

  const tokenPayload = { id: user.id, tokenVersion: user.token_version };
  return success(res, {
    accessToken:  signToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
    user: {
      id:          user.id,
      associateId: user.associate_id,
      fullName:    user.full_name,
      stage:       user.current_stage,
      isActive:    user.is_active,
      isRetired:   user.is_retired,
    },
  });
}

// ── Refresh token ──────────────────────────────────────────────────

async function refreshToken(req, res) {
  const { refreshToken: token } = req.body;
  if (!token) return badRequest(res, 'Refresh token required');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return unauthorized(res, 'Invalid or expired refresh token');
  }

  const result = await query(
    `SELECT id, token_version FROM users WHERE id = $1`,
    [payload.id]
  );
  if (!result.rowCount || result.rows[0].token_version !== payload.tokenVersion) {
    return unauthorized(res, 'Session expired');
  }

  const newPayload   = { id: payload.id, tokenVersion: payload.tokenVersion };
  return success(res, { accessToken: signToken(newPayload) });
}

// ── Change password ────────────────────────────────────────────────

async function changePassword(req, res) {
  const { error: valErr, value } = validate(changePasswordSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const user = await query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!user.rowCount) return notFound(res, 'User not found');

  const valid = await comparePassword(value.current_password, user.rows[0].password_hash);
  if (!valid) return badRequest(res, 'Current password is incorrect');

  const newHash = await hashPassword(value.new_password);
  // Increment token_version to invalidate all existing sessions
  await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2`,
    [newHash, req.user.id]
  );

  return success(res, null, 'Password changed successfully. Please login again.');
}

// ── Forgot password — send OTP ─────────────────────────────────────

async function forgotPassword(req, res) {
  const { error: valErr, value } = validate(forgotPasswordSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const exists = await query(`SELECT id FROM users WHERE mobile = $1`, [value.mobile]);
  if (!exists.rowCount) return notFound(res, 'Mobile number not registered');

  const result = await sendOTP(value.mobile, 'password_reset');
  return success(res, result, 'Password reset OTP sent');
}

// ── Reset password — verify OTP + set new password ─────────────────

async function resetPassword(req, res) {
  const { error: valErr, value } = validate(resetPasswordSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const { mobile, otp, new_password } = value;

  const otpCheck = await verifyOTPCode(mobile, otp, 'password_reset');
  if (!otpCheck.valid) return badRequest(res, otpCheck.error);

  const newHash = await hashPassword(new_password);
  const result  = await query(
    `UPDATE users
     SET password_hash = $1, token_version = token_version + 1,
         failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
     WHERE mobile = $2
     RETURNING id`,
    [newHash, mobile]
  );

  if (!result.rowCount) return notFound(res, 'User not found');

  await logAction(result.rows[0].id, 'password_reset', req.clientIp, req.deviceFingerprint);
  return success(res, null, 'Password reset successfully. Please login with your new password.');
}

// ── Logout ─────────────────────────────────────────────────────────

async function logout(req, res) {
  // Increment token version to invalidate current token
  await query(
    `UPDATE users SET token_version = token_version + 1 WHERE id = $1`,
    [req.user.id]
  );
  await logAction(req.user.id, 'logout', req.clientIp, req.deviceFingerprint);
  return success(res, null, 'Logged out successfully');
}

// ── Validate referral code (public) ───────────────────────────────

async function checkReferralCode(req, res) {
  const { code } = req.params;
  if (!code) return badRequest(res, 'Referral code required');

  const check = await validateReferralCode(code);
  if (!check.valid) return badRequest(res, check.error);

  // Return available positions
  const posResult = await query(
    `SELECT position FROM users WHERE sponsor_id = $1`,
    [check.sponsor.id]
  );
  const takenPositions = posResult.rows.map(r => r.position);
  const availablePositions = ['left', 'middle', 'right'].filter(p => !takenPositions.includes(p));

  return success(res, {
    sponsor: {
      associateId: check.sponsor.associate_id,
      name:        check.sponsor.full_name,
    },
    availablePositions,
    takenPositions,
  });
}

module.exports = {
  register,
  loginWithPassword,
  sendLoginOTP,
  verifyLoginOTP,
  refreshToken,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  checkReferralCode,
};
