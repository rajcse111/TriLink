const crypto = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ── Password helpers ───────────────────────────────────────────────

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

// ── OTP generation ─────────────────────────────────────────────────

function generateOTP(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

async function hashOTP(otp) {
  return bcrypt.hash(otp, 8); // Lower rounds for OTPs (speed)
}

async function verifyOTP(otp, hash) {
  return bcrypt.compare(otp, hash);
}

// ── Referral code ──────────────────────────────────────────────────

function generateReferralCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
  let code = 'T';
  for (let i = 1; i < length; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

// ── JWT helpers ────────────────────────────────────────────────────

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// ── Misc ───────────────────────────────────────────────────────────

function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Simple fingerprint from request headers (fraud detection baseline)
 */
function buildDeviceFingerprint(req) {
  const ua  = req.headers['user-agent']  || '';
  const lang= req.headers['accept-language'] || '';
  const enc = req.headers['accept-encoding']  || '';
  return crypto.createHash('sha256').update(`${ua}|${lang}|${enc}`).digest('hex');
}

module.exports = {
  hashPassword, comparePassword,
  generateOTP, hashOTP, verifyOTP,
  generateReferralCode,
  signToken, signRefreshToken, verifyToken, verifyRefreshToken,
  generateSecureToken, buildDeviceFingerprint,
};
