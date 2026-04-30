const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const { authenticateAdmin, requireSuperAdmin } = require('../middleware/admin.middleware');
const { authLimiter }                          = require('../middleware/rateLimit.middleware');

// Public
router.post('/auth/login', authLimiter, ctrl.adminLogin);

// Protected - all below require admin auth
router.use(authenticateAdmin);

// Users
router.get('/users',                   ctrl.getUsers);
router.get('/users/:id',               ctrl.getUserDetail);
router.post('/users/:id/activate',     ctrl.activateUser);
router.post('/users/:id/deactivate',   ctrl.deactivateUser);
router.post('/users/:id/credit',       requireSuperAdmin, ctrl.adminCreditWallet);

// KYC
router.get('/kyc/pending',             ctrl.getPendingKYC);
router.post('/kyc/:id/verify',         ctrl.verifyKYC);

// Withdrawals
router.get('/withdrawals/pending',     ctrl.getPendingWithdrawals);
router.post('/withdrawals/:id/process', ctrl.processWithdrawal);

// Meetings
router.post('/meetings',               ctrl.createMeeting);
router.put('/meetings/:id',            ctrl.updateMeeting);
router.delete('/meetings/:id',         ctrl.deleteMeeting);

// Complaints
router.get('/complaints',              ctrl.getAllComplaints);
router.post('/complaints/:id/respond', ctrl.respondToComplaint);

// Reports
router.get('/reports',                 ctrl.getReports);

// Batch
router.post('/batch/trigger',          requireSuperAdmin, ctrl.triggerBatch);
router.get('/batch/logs',              ctrl.getBatchLogs);

module.exports = router;
