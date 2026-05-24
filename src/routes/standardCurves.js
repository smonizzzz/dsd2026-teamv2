const router = require('express').Router();
const {
  createStandardCurve,
  getStandardCurves,
  getStandardCurveById,
  compareStandardCurve
} = require('../controllers/standardCurvesController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getStandardCurves);
router.get('/compare', requireAuth, compareStandardCurve);
router.get('/:id', requireAuth, getStandardCurveById);
router.post('/', requireAuth, createStandardCurve);

module.exports = router;
