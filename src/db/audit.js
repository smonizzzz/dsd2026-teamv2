const { run } = require('./helpers');

function logAudit(db, { userId, action, targetType, targetId, details }) {
  const detailsStr = details ? JSON.stringify(details) : null;
  run(db,
    'INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId || null, action, targetType || null, targetId || null, detailsStr]
  );
}

module.exports = { logAudit };
