const router = require('express').Router();
const { getRecommendationsBySession, createRecommendation, updateRecommendationStatus, generateRecommendations } = require('../controllers/recommendationsController');
router.get('/session/:sessionId', getRecommendationsBySession);
router.get('/engine/:userId',     generateRecommendations);
router.post('/',                  createRecommendation);
router.patch('/:id',              updateRecommendationStatus);
module.exports = router;
