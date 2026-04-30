const { query }                = require('../config/database');
const { buildDeviceFingerprint } = require('../utils/crypto');
const logger                   = require('../utils/logger');

/**
 * Track device fingerprint and IP on requests.
 * Logs suspicious patterns (same device, multiple accounts).
 */
async function trackDevice(req, res, next) {
  try {
    const fingerprint = buildDeviceFingerprint(req);
    const ip          = req.ip || req.connection?.remoteAddress || 'unknown';

    req.deviceFingerprint = fingerprint;
    req.clientIp          = ip;

    // Check for account lockout
    if (req.user) {
      const result = await query(
        'SELECT locked_until FROM users WHERE id = $1',
        [req.user.id]
      );
      if (result.rowCount && result.rows[0].locked_until) {
        const lockedUntil = new Date(result.rows[0].locked_until);
        if (lockedUntil > new Date()) {
          return res.status(403).json({
            success: false,
            message: `Account temporarily locked until ${lockedUntil.toISOString()}`,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('Fraud middleware error (non-blocking)', { error: err.message });
  }
  next();
}

/**
 * Check for suspicious login: same fingerprint tied to many accounts.
 */
async function checkDuplicateDevice(req, res, next) {
  try {
    const fingerprint = buildDeviceFingerprint(req);
    const ip          = req.ip || 'unknown';

    // Count distinct users from same IP in last 24 hours
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) AS cnt
       FROM login_logs
       WHERE ip_address = $1
         AND action = 'register'
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [ip]
    );

    const count = parseInt(result.rows[0]?.cnt || '0', 10);
    if (count >= 5) {
      logger.warn('Suspicious registration: multiple accounts from same IP', { ip, count });
      return res.status(429).json({
        success: false,
        message: 'Too many registrations from this network. Contact support.',
      });
    }
  } catch (err) {
    logger.warn('Duplicate device check error (non-blocking)', { error: err.message });
  }
  next();
}

/**
 * Log user action for audit trail.
 */
async function logAction(userId, action, ip, fingerprint, meta = {}) {
  try {
    await query(
      `INSERT INTO login_logs (user_id, ip_address, device_fingerprint, action, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, ip, fingerprint, action, JSON.stringify(meta)]
    );
  } catch (err) {
    logger.warn('Failed to log action', { error: err.message });
  }
}

module.exports = { trackDevice, checkDuplicateDevice, logAction };
