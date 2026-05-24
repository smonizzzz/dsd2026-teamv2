const router = require('express').Router();
const { getSessions, getSessionById, createSession, endSession, deleteSession } = require('../controllers/sessionsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',          requireAuth, getSessions);
router.get('/:id',       requireAuth, getSessionById);
router.post('/',         requireAuth, createSession);
router.patch('/:id/end', requireAuth, endSession);
router.delete('/:id',    requireAuth, deleteSession);
module.exports = router;
