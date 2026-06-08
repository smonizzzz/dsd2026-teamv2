const router = require('express').Router();
const { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement } = require('../controllers/announcementsController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Reads: any authenticated user (patients see published announcements). Writes: admin only.
router.get('/',       requireAuth, getAnnouncements);
router.get('/:id',    requireAuth, getAnnouncementById);
router.post('/',      requireAuth, requireRole('admin'), createAnnouncement);
router.patch('/:id',  requireAuth, requireRole('admin'), updateAnnouncement);
router.delete('/:id', requireAuth, requireRole('admin'), deleteAnnouncement);

module.exports = router;
