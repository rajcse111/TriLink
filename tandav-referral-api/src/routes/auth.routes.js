const router  = require('express').Router();
const ctrl    = require('../controllers/auth.controller');
const { authenticate }                         = require('../middleware/auth.middleware');
const { authLimiter, otpLimiter }              = require('../middleware/rateLimit.middleware');
const { trackDevice, checkDuplicateDevice }    = require('../middleware/fraud.middleware');

// Public routes
router.get('/referral/:code',          ctrl.checkReferralCode);
router.post('/register',    authLimiter, checkDuplicateDevice, trackDevice, ctrl.register);
router.post('/login',       authLimiter, trackDevice,          ctrl.loginWithPassword);
router.post('/otp/send',    otpLimiter,  ctrl.sendLoginOTP);
router.post('/otp/verify',  authLimiter, trackDevice,          ctrl.verifyLoginOTP);
router.post('/refresh',                  ctrl.refreshToken);

// Password reset (public — user is locked out)
router.post('/password/forgot', otpLimiter,             ctrl.forgotPassword);
router.post('/password/reset',  authLimiter, trackDevice, ctrl.resetPassword);

// Protected routes
router.post('/logout',          authenticate, ctrl.logout);
router.put('/change-password',  authenticate, ctrl.changePassword);

module.exports = router;
