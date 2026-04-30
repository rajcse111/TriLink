const router = require('express').Router();
const ctrl   = require('../controllers/complaint.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.post('/',    ctrl.createComplaint);  // NM - New Message
router.get('/',     ctrl.getComplaints);    // VM - View Messages
router.get('/:id',  ctrl.getComplaintById);

module.exports = router;
