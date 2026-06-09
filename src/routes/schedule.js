const router = require('express').Router();
const { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem } = require('../controllers/scheduleController');

router.get('/:userId',  getSchedule);
router.post('/',        createScheduleItem);
router.patch('/:id',    updateScheduleItem);
router.delete('/:id',   deleteScheduleItem);

module.exports = router;
