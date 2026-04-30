const { query }                    = require('../config/database');
const { generateOTP, hashOTP, verifyOTP } = require('../utils/crypto');
const nodemailer                   = require('nodemailer');
const logger                       = require('../utils/logger');

const OTP_EXPIRES_MIN = parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

// ── Email transporter ──────────────────────────────────────────────
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ── Generate & send OTP ────────────────────────────────────────────

async function sendOTP(mobile, purpose = 'login') {
  // Invalidate previous OTPs for this identifier+purpose
  await query(
    `UPDATE otps SET is_used = TRUE WHERE identifier = $1 AND purpose = $2 AND is_used = FALSE`,
    [mobile, purpose]
  );

  const otp     = generateOTP(6);
  const otpHash = await hashOTP(otp);
  const expires = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);

  await query(
    `INSERT INTO otps (identifier, otp_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [mobile, otpHash, purpose, expires]
  );

  // In production: send via SMS gateway (MSG91/Twilio)
  // In development: log to console
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[DEV] OTP for ${mobile} (${purpose}): ${otp}`);
  } else {
    await sendSMS(mobile, `Your TriLink Network OTP is: ${otp}. Valid for ${OTP_EXPIRES_MIN} minutes. Do not share.`);
  }

  return { message: `OTP sent to ${mobile}`, expiresIn: OTP_EXPIRES_MIN };
}

async function verifyOTPCode(identifier, otp, purpose = 'login') {
  const result = await query(
    `SELECT id, otp_hash, attempts, expires_at
     FROM otps
     WHERE identifier = $1 AND purpose = $2 AND is_used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (!result.rowCount) {
    return { valid: false, error: 'OTP not found or already used' };
  }

  const record = result.rows[0];

  if (new Date() > new Date(record.expires_at)) {
    return { valid: false, error: 'OTP has expired' };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { valid: false, error: 'Too many invalid attempts. Request a new OTP.' };
  }

  const isValid = await verifyOTP(otp, record.otp_hash);

  if (!isValid) {
    await query(`UPDATE otps SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
    return { valid: false, error: 'Invalid OTP' };
  }

  // Mark as used
  await query(`UPDATE otps SET is_used = TRUE WHERE id = $1`, [record.id]);
  return { valid: true };
}

// ── Email OTP ──────────────────────────────────────────────────────

async function sendEmailOTP(email, purpose = 'login') {
  await query(
    `UPDATE otps SET is_used = TRUE WHERE identifier = $1 AND purpose = $2 AND is_used = FALSE`,
    [email, purpose]
  );

  const otp     = generateOTP(6);
  const otpHash = await hashOTP(otp);
  const expires = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);

  await query(
    `INSERT INTO otps (identifier, otp_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [email, otpHash, purpose, expires]
  );

  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[DEV] Email OTP for ${email} (${purpose}): ${otp}`);
  } else {
    await sendEmail(
      email,
      `Your TriLink Network OTP`,
      `<h2>Your OTP</h2><p>Your OTP is: <strong>${otp}</strong></p><p>Valid for ${OTP_EXPIRES_MIN} minutes.</p>`
    );
  }

  return { message: `OTP sent to ${email}`, expiresIn: OTP_EXPIRES_MIN };
}

// ── SMS / WhatsApp gateway ─────────────────────────────────────────

async function sendSMS(mobile, message) {
  const provider = process.env.SMS_PROVIDER;
  try {
    if (provider === 'twilio_whatsapp') {
      await sendViaTwilio(mobile, message, true);
      logger.info('WhatsApp OTP sent via Twilio', { mobile });
    } else if (provider === 'twilio') {
      await sendViaTwilio(mobile, message, false);
      logger.info('SMS sent via Twilio', { mobile });
    } else if (provider === 'fast2sms') {
      await sendViaFast2SMS(mobile, message);
      logger.info('SMS sent via Fast2SMS', { mobile });
    } else {
      // No provider configured — log so it's visible in any environment
      logger.warn(`[NO SMS PROVIDER] OTP for ${mobile}: ${message}`);
    }
  } catch (err) {
    logger.error('SMS send failed', { mobile, provider, error: err.message });
  }
}

// Twilio — SMS or WhatsApp sandbox (free)
// WhatsApp sandbox setup: user texts "join <sandbox-keyword>" to +14155238886
function sendViaTwilio(mobile, message, useWhatsApp) {
  return new Promise((resolve, reject) => {
    const https  = require('https');
    const qs     = require('querystring');
    const sid    = process.env.TWILIO_ACCOUNT_SID;
    const from   = useWhatsApp
      ? (process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886')
      : process.env.TWILIO_FROM_NUMBER;
    const to     = useWhatsApp ? `whatsapp:+91${mobile}` : `+91${mobile}`;
    const body   = qs.stringify({ To: to, From: from, Body: message });
    const auth   = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

    const req = https.request({
      hostname: 'api.twilio.com',
      path:     `/2010-04-01/Accounts/${sid}/Messages.json`,
      method:   'POST',
      headers:  {
        Authorization:   `Basic ${auth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`Twilio ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Fast2SMS — free tier available at fast2sms.com (sign up → get API key)
function sendViaFast2SMS(mobile, message) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const body  = JSON.stringify({
      route:    'q',
      message,
      language: 'english',
      flash:    0,
      numbers:  mobile,
    });

    const req = https.request({
      hostname: 'www.fast2sms.com',
      path:     '/dev/bulkV2',
      method:   'POST',
      headers:  {
        authorization:   process.env.FAST2SMS_API_KEY,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.return) resolve(parsed);
        else reject(new Error(`Fast2SMS: ${parsed.message || data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendEmail(to, subject, html) {
  try {
    const t = getTransporter();
    await t.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
    logger.info('Email sent', { to, subject });
  } catch (err) {
    logger.error('Email send failed', { to, error: err.message });
  }
}

module.exports = { sendOTP, verifyOTPCode, sendEmailOTP, sendEmail };
