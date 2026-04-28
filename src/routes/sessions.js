const router = require('express').Router();
const { getSessions, getSessionById, createSession, endSession, deleteSession } = require('../controllers/sessionsController');
router.get('/',          getSessions);
router.get('/:id',       getSessionById);
router.post('/',         createSession);
router.patch('/:id/end', endSession);
router.delete('/:id',    deleteSession);
module.exports = router;
