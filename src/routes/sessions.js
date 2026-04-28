const router = require('express').Router();
const { getSessions, getSessionById, createSession, endSession } = require('../controllers/sessionsController');
router.get('/',          getSessions);
router.get('/:id',       getSessionById);
router.post('/',         createSession);
router.patch('/:id/end', endSession);
module.exports = router;
