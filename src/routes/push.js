const router = require('express').Router();
const { registerToken, getTokens } = require('../controllers/pushController');

router.post('/register',       registerToken);
router.get('/tokens/:userId',  getTokens);

module.exports = router;
