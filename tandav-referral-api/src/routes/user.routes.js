const router  = require('express').Router();
const ctrl    = require('../controllers/user.controller');
const { authenticate, requireActive } = require('../middleware/auth.middleware');
const { trackDevice }                 = require('../middleware/fraud.middleware');
const { otpLimiter }                  = require('../middleware/rateLimit.middleware');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// Upload config
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${req.user.id}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext     = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10)) * 1024 * 1024 },
});

// All routes require authentication
router.use(authenticate);

// Dashboard
router.get('/dashboard',  ctrl.getDashboard);

// Profile
router.get('/profile',    ctrl.getProfile);
router.put('/profile',    ctrl.updateProfile);
router.post('/profile/image', upload.single('image'), ctrl.uploadProfileImage);

// Welcome letter / ID card
router.get('/welcome-letter', ctrl.getWelcomeLetter);

// KYC
router.post('/kyc', upload.fields([{ name: 'front_image', maxCount: 1 }, { name: 'back_image', maxCount: 1 }]), ctrl.submitKYC);
router.get('/kyc',  ctrl.getKYCStatus);

// Bank Details
router.get('/bank-details',        ctrl.getBankDetails);
router.post('/bank-details',       ctrl.addBankDetail);
router.delete('/bank-details/:id', ctrl.deleteBankDetail);

// Account Activation
router.post('/activate', trackDevice, ctrl.activateAccount);

// Transaction password
router.put('/transaction-password', otpLimiter, ctrl.changeTransactionPassword);

module.exports = router;
