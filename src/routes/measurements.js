const router = require('express').Router();
const { getMeasurementsBySession, createMeasurement, createMeasurementsBatch, createRawMeasurement } = require('../controllers/measurementsController');
const { requireAuth } = require('../middleware/auth');

router.get('/:sessionId', requireAuth, getMeasurementsBySession);
router.post('/batch',     createMeasurementsBatch);
router.post('/raw',       createRawMeasurement);
router.post('/',          createMeasurement);
module.exports = router;
