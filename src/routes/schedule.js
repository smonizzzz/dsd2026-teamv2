const router = require('express').Router();
const { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem } = require('../controllers/scheduleController');
const { requireAuth } = require('../middleware/auth');

router.get('/:userId',  requireAuth, getSchedule);
router.post('/',        requireAuth, createScheduleItem);
router.patch('/:id',    requireAuth, updateScheduleItem);
router.delete('/:id',   requireAuth, deleteScheduleItem);

module.exports = router;
