const router = require('express').Router();
const { getMeasurementsBySession, createMeasurement, createMeasurementsBatch, createRawMeasurement } = require('../controllers/measurementsController');
router.get('/:sessionId', getMeasurementsBySession);
router.post('/batch',     createMeasurementsBatch);
router.post('/raw',       createRawMeasurement);
router.post('/',          createMeasurement);
module.exports = router;
