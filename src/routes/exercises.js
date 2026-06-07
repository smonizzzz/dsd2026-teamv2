const router = require('express').Router();
const { getExercises } = require('../controllers/exercisesController');

router.get('/', getExercises);

module.exports = router;
