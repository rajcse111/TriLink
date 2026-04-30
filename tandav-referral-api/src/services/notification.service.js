const { query } = require('../config/database');
const logger    = require('../utils/logger');

/**
 * Create an in-app notification for a user.
 */
async function notify(userId, type, { title, message, metadata = {} }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, JSON.stringify(metadata)]
    );
  } catch (err) {
    logger.error('Notification insert failed', { userId, type, error: err.message });
  }
}

async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
  const offset = (page - 1) * limit;
  const params = [userId];
  let sql = `SELECT * FROM notifications WHERE user_id = $1`;
  if (unreadOnly) sql += ` AND is_read = FALSE`;
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const countParams = [userId];
  let countSql = `SELECT COUNT(*) FROM notifications WHERE user_id = $1`;
  if (unreadOnly) countSql += ` AND is_read = FALSE`;

  const [data, countResult] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  return {
    data:  data.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

async function markRead(userId, notificationId = null) {
  if (notificationId) {
    await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  } else {
    // Mark all as read
    await query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
  }
}

async function getUnreadCount(userId) {
  const result = await query(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return parseInt(result.rows[0]?.cnt || '0', 10);
}

module.exports = { notify, getNotifications, markRead, getUnreadCount };
