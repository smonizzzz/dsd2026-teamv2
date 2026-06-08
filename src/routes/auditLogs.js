const router = require('express').Router();
const { getAuditLogs, getAuditLogById } = require('../controllers/auditLogController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Audit log is administrator-only.
router.get('/',    requireAuth, requireRole('admin'), getAuditLogs);
router.get('/:id', requireAuth, requireRole('admin'), getAuditLogById);

module.exports = router;
