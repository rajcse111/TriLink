const jwt           = require('jsonwebtoken');
const { query }     = require('../config/database');
const { unauthorized, forbidden } = require('../utils/response');
const logger        = require('../utils/logger');

async function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Admin authentication required');
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return unauthorized(res, 'Invalid or expired admin token');
    }

    if (!payload.isAdmin) {
      return forbidden(res, 'Admin access required');
    }

    const result = await query(
      'SELECT id, username, email, role, is_active FROM admins WHERE id = $1',
      [payload.id]
    );

    if (!result.rowCount) return unauthorized(res, 'Admin not found');

    const admin = result.rows[0];
    if (!admin.is_active) return forbidden(res, 'Admin account is disabled');

    req.admin = {
      id:       admin.id,
      username: admin.username,
      email:    admin.email,
      role:     admin.role,
    };
    next();
  } catch (err) {
    logger.error('Admin auth middleware error', { error: err.message });
    return unauthorized(res, 'Admin authentication failed');
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== 'super_admin') {
    return forbidden(res, 'Super admin access required');
  }
  next();
}

module.exports = { authenticateAdmin, requireSuperAdmin };
