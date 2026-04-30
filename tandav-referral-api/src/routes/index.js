const router = require('express').Router();

router.use('/auth',       require('./auth.routes'));
router.use('/user',       require('./user.routes'));
router.use('/genealogy',  require('./genealogy.routes'));
router.use('/wallet',     require('./wallet.routes'));
router.use('/income',     require('./income.routes'));
router.use('/meetings',   require('./meeting.routes'));
router.use('/complaints', require('./complaint.routes'));
router.use('/admin',      require('./admin.routes'));

// Notification routes (inline - simple enough)
const { authenticate }     = require('../middleware/auth.middleware');
const notifService         = require('../services/notification.service');
const { success }          = require('../utils/response');

router.get('/notifications', authenticate, async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const page  = parseInt(req.query.page  || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const data  = await notifService.getNotifications(req.user.id, { page, limit, unreadOnly });
  return res.json({ success: true, ...data });
});

router.post('/notifications/read', authenticate, async (req, res) => {
  await notifService.markRead(req.user.id, req.body.id || null);
  return success(res, null, 'Notifications marked as read');
});

router.get('/notifications/count', authenticate, async (req, res) => {
  const count = await notifService.getUnreadCount(req.user.id);
  return success(res, { unread: count });
});

// OTP for transaction password change
const { sendOTP } = require('../services/otp.service');
const { otpLimiter } = require('../middleware/rateLimit.middleware');

router.post('/otp/transaction', authenticate, otpLimiter, async (req, res) => {
  const { query } = require('../config/database');
  const userResult = await query(`SELECT mobile FROM users WHERE id = $1`, [req.user.id]);
  if (!userResult.rowCount) return res.status(404).json({ success: false, message: 'User not found' });
  const result = await sendOTP(userResult.rows[0].mobile, 'transaction');
  return success(res, result);
});

// Stage progress
router.get('/stage/progress', authenticate, async (req, res) => {
  const { getStageProgress } = require('../services/stage.service');
  const data = await getStageProgress(req.user.id);
  return success(res, data);
});

// Health check
router.get('/health', async (req, res) => {
  const { testConnection } = require('../config/database');
  const dbOk = await testConnection();
  return res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { database: dbOk ? 'up' : 'down' },
  });
});

module.exports = router;
