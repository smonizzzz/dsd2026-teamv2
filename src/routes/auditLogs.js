const router = require('express').Router();
const { getAuditLogs, getAuditLogById } = require('../controllers/auditLogController');
router.get('/',    getAuditLogs);
router.get('/:id', getAuditLogById);
module.exports = router;
