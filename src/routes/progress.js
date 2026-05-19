const router = require('express').Router();
const { getProgressByUser } = require('../controllers/progressController');

router.get('/:userId', getProgressByUser);

module.exports = router;
