const router = require('express').Router();
const ctrl   = require('../controllers/wallet.controller');
const { authenticate, requireActive } = require('../middleware/auth.middleware');
const { withdrawalLimiter }           = require('../middleware/rateLimit.middleware');

router.use(authenticate, requireActive);

router.get('/balance',         ctrl.getWalletBalance);
router.get('/transactions',    ctrl.getTransactionHistory);
router.post('/withdraw',       withdrawalLimiter, ctrl.requestWithdrawal);
router.get('/withdrawals',     ctrl.getWithdrawalHistory);

module.exports = router;
