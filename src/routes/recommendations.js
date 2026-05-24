const router = require('express').Router();
const { getRecommendationsBySession, createRecommendation, updateRecommendationStatus, generateRecommendations } = require('../controllers/recommendationsController');
const { requireAuth } = require('../middleware/auth');

router.get('/session/:sessionId', requireAuth, getRecommendationsBySession);
router.get('/engine/:userId',     requireAuth, generateRecommendations);
router.post('/',                  createRecommendation);
router.patch('/:id',              updateRecommendationStatus);
module.exports = router;
