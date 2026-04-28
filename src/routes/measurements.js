const router = require('express').Router();
const { getMeasurementsBySession, createMeasurement, createMeasurementsBatch } = require('../controllers/measurementsController');
router.get('/:sessionId', getMeasurementsBySession);
router.post('/batch',     createMeasurementsBatch);
router.post('/',          createMeasurement);
module.exports = router;
