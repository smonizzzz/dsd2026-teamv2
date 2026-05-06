const router = require('express').Router();
const { getFeedback, getFeedbackById, createFeedback, updateFeedback } = require('../controllers/feedbackController');
router.get('/',     getFeedback);
router.get('/:id',  getFeedbackById);
router.post('/',    createFeedback);
router.patch('/:id', updateFeedback);
module.exports = router;
