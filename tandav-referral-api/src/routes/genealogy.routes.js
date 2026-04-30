const router = require('express').Router();
const ctrl   = require('../controllers/genealogy.controller');
const { authenticate, requireActive } = require('../middleware/auth.middleware');

router.use(authenticate, requireActive);

router.get('/sponsor',       ctrl.getDirectSponsor);    // DS
router.get('/team/all',      ctrl.getAllTeamList);       // AT
router.get('/team/left',     ctrl.getLeftTeam);         // LT
router.get('/team/middle',   ctrl.getMiddleTeam);       // MT
router.get('/team/right',    ctrl.getRightTeam);        // RT
router.get('/team/active',   ctrl.getActiveTeam);       // Active
router.get('/team/inactive', ctrl.getInactiveTeam);     // Inactive (IT)
router.get('/tree',          ctrl.getTreeViewData);     // TV
router.get('/levels',        ctrl.getLevelGenealogyData); // LG

module.exports = router;
