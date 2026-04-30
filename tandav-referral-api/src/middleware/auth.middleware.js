const { verifyToken }    = require('../utils/crypto');
const { unauthorized }   = require('../utils/response');
const { query }          = require('../config/database');
const logger             = require('../utils/logger');

/**
 * Authenticate user via Bearer JWT token.
 * Attaches req.user = { id, associateId, stage, isActive, isRetired, tokenVersion }
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Authentication token required');
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return unauthorized(res, msg);
    }

    // Fetch current user to validate token version and active status
    const result = await query(
      `SELECT id, associate_id, current_stage, is_active, is_retired,
              token_version, designation, full_name
       FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!result.rowCount) {
      return unauthorized(res, 'User not found');
    }

    const user = result.rows[0];

    // Invalidated token check (password change / forced logout increments token_version)
    if (user.token_version !== payload.tokenVersion) {
      return unauthorized(res, 'Session expired. Please login again');
    }

    req.user = {
      id:            user.id,
      associateId:   user.associate_id,
      stage:         user.current_stage,
      isActive:      user.is_active,
      isRetired:     user.is_retired,
      designation:   user.designation,
      fullName:      user.full_name,
      tokenVersion:  user.token_version,
    };

    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    return unauthorized(res, 'Authentication failed');
  }
}

/**
 * Require active account (activated and paid).
 */
function requireActive(req, res, next) {
  if (!req.user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Account not activated. Please complete activation payment.',
    });
  }
  next();
}

/**
 * Require non-retired account.
 */
function requireNotRetired(req, res, next) {
  if (req.user.isRetired) {
    return res.status(403).json({
      success: false,
      message: 'Account is retired. No further actions allowed.',
    });
  }
  next();
}

module.exports = { authenticate, requireActive, requireNotRetired };
