const router = require('express').Router();
const { getPatients, getPatientById } = require('../controllers/usersController');

router.get('/',    getPatients);
router.get('/:id', getPatientById);

module.exports = router;
