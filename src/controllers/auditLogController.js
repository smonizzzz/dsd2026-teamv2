const getDb = require('../db/connection');
const { queryAll, queryOne } = require('../db/helpers');

async function getAuditLogs(req, res, next) {
  try {
    const { db } = await getDb();
    const { userId, action, targetType } = req.query;

    const conditions = [];
    const values = [];
    if (userId)     { conditions.push('l.user_id = ?');     values.push(userId); }
    if (action)     { conditions.push('l.action = ?');      values.push(action); }
    if (targetType) { conditions.push('l.target_type = ?'); values.push(targetType); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    res.json(queryAll(db,
      `SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${where} ORDER BY l.created_at DESC`,
      values
    ));
  } catch (err) { next(err); }
}

async function getAuditLogById(req, res, next) {
  try {
    const { db } = await getDb();
    const row = queryOne(db,
      'SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?',
      [req.params.id]
    );
    if (!row) { const e = new Error('Audit log not found'); e.status = 404; return next(e); }
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { getAuditLogs, getAuditLogById };
