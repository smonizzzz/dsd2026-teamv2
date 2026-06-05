const router = require('express').Router();
const { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem } = require('../controllers/scheduleController');
const { getExercises, createExercise, completeExercise } = require('../controllers/scheduleExercisesController');

// Exercise sub-resource — declared before '/:userId' so the literal segments match first.
router.get('/:id/exercises',                        getExercises);
router.post('/:id/exercises',                       createExercise);
router.patch('/:id/exercises/:exerciseId/complete', completeExercise);

router.get('/:userId',  getSchedule);
router.post('/',        createScheduleItem);
router.patch('/:id',    updateScheduleItem);
router.delete('/:id',   deleteScheduleItem);

module.exports = router;
