const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { createPainEntry, getPainHistory, getPainStats } = require('../controllers/painController');

router.post('/',                requireAuth, createPainEntry);
router.get('/:userId',          requireAuth, getPainHistory);
router.get('/:userId/stats',    requireAuth, getPainStats);

module.exports = router;
