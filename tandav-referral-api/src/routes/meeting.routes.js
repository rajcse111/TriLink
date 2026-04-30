const router = require('express').Router();
const ctrl   = require('../controllers/meeting.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',    ctrl.getMeetings);
router.get('/:id', ctrl.getMeetingById);

module.exports = router;
