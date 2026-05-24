const router = require('express').Router();
const { createInvite, getInviteByToken, getInvites } = require('../controllers/doctorInvitesController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getInvites);
router.post('/', requireAuth, createInvite);
router.get('/:token', getInviteByToken);

module.exports = router;
