const router = require('express').Router();
const { getFeedback, getFeedbackById, createFeedback, updateFeedback } = require('../controllers/feedbackController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Any authenticated user can submit feedback; listing and responding is admin only.
router.post('/',     requireAuth, createFeedback);
router.get('/',      requireAuth, requireRole('admin'), getFeedback);
router.get('/:id',   requireAuth, requireRole('admin'), getFeedbackById);
router.patch('/:id', requireAuth, requireRole('admin'), updateFeedback);

module.exports = router;
