const router = require('express').Router();
const { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement } = require('../controllers/announcementsController');
router.get('/',      getAnnouncements);
router.get('/:id',   getAnnouncementById);
router.post('/',     createAnnouncement);
router.patch('/:id', updateAnnouncement);
router.delete('/:id', deleteAnnouncement);
module.exports = router;
