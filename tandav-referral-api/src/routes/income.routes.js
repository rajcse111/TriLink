const router = require('express').Router();
const ctrl   = require('../controllers/income.controller');
const { authenticate, requireActive } = require('../middleware/auth.middleware');

router.use(authenticate, requireActive);

router.get('/overview',  ctrl.getIncomeOverview);      // Total income summary
router.get('/level',     ctrl.getLevelIncomeSummary);  // LB - level income
router.get('/daily',     ctrl.getDailyIncome);         // DP - daily income
router.get('/history',   ctrl.getIncomeHistory);       // Paginated income history

module.exports = router;
