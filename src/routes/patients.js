const router = require('express').Router();
const { getPatients, getPatientById } = require('../controllers/usersController');
const { requireAuth } = require('../middleware/auth');

router.get('/',    requireAuth, getPatients);
router.get('/:id', requireAuth, getPatientById);

module.exports = router;
