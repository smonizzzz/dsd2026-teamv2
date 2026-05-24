const router = require('express').Router();
const { getProgressByUser } = require('../controllers/progressController');
const { requireAuth } = require('../middleware/auth');

router.get('/:userId', requireAuth, getProgressByUser);

module.exports = router;
