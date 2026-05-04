const router = require('express').Router();
const { register, login, me, getStatus, approveUser, conditionalUpload } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/register',          conditionalUpload, register);
router.post('/login',             login);
router.get('/me',                 requireAuth, me);
router.get('/status',             requireAuth, getStatus);
router.patch('/approve/:userId',  requireAuth, approveUser);

module.exports = router;
