const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { logAudit } = require('../db/audit');

// Privacy gate for pain-log reads:
//   patient → may only read their own logs
//   clinician → may only read the logs of patients bound to them (users.doctor_id)
//   admin → may read any
// Returns null if allowed, otherwise an http-error to forward via next().
function checkPainAccess(db, requestingUser, targetUserId) {
  if (!requestingUser) {
    const e = new Error('Authentication required'); e.status = 401; return e;
  }
  if (requestingUser.role === 'admin') return null;
  const target = Number(targetUserId);
  if (requestingUser.role === 'patient') {
    if (Number(requestingUser.id) !== target) {
      const e = new Error('Patients can only view their own pain logs'); e.status = 403; return e;
    }
    return null;
  }
  if (requestingUser.role === 'clinician') {
    const bound = queryOne(db,
      "SELECT 1 FROM users WHERE id = ? AND role = 'patient' AND doctor_id = ?",
      [target, requestingUser.id]
    );
    if (!bound) {
      const e = new Error('Clinicians can only view pain logs for their own patients'); e.status = 403; return e;
    }
    return null;
  }
  const e = new Error('Forbidden'); e.status = 403; return e;
}

async function createPainEntry(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { level, notes } = req.body;
    const userId = req.user.id;

    if (level === undefined || level === null) {
      const e = new Error('level is required'); e.status = 400; return next(e);
    }
    const lvl = Number(level);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 10) {
      const e = new Error('level must be an integer between 1 and 10'); e.status = 400; return next(e);
    }

    const result = run(db,
      'INSERT INTO pain_logs (user_id, level, notes) VALUES (?, ?, ?)',
      [userId, lvl, notes || null]
    );
    logAudit(db, { userId, action: 'CREATE_PAIN_LOG', targetType: 'pain_log', targetId: result.lastInsertRowid, details: { level: lvl } });
    save();

    const created = queryOne(db, 'SELECT id, user_id, level, notes, created_at FROM pain_logs WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err) { next(err); }
}

async function getPainHistory(req, res, next) {
  try {
    const { db } = await getDb();
    const denied = checkPainAccess(db, req.user, req.params.userId);
    if (denied) return next(denied);

    const painLogs = queryAll(db,
      'SELECT id, user_id, level, notes, created_at FROM pain_logs WHERE user_id = ? ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(painLogs);
  } catch (err) { next(err); }
}

async function getPainStats(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [req.params.userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const denied = checkPainAccess(db, req.user, req.params.userId);
    if (denied) return next(denied);

    const stats = queryOne(db, `
      SELECT
        COUNT(*)         AS total_entries,
        AVG(level)       AS average_level,
        MIN(level)       AS min_level,
        MAX(level)       AS max_level,
        MIN(created_at)  AS first_entry,
        MAX(created_at)  AS latest_entry
      FROM pain_logs
      WHERE user_id = ?
    `, [req.params.userId]);

    res.json(stats || {
      total_entries: 0, average_level: null, min_level: null, max_level: null,
      first_entry: null, latest_entry: null
    });
  } catch (err) { next(err); }
}

module.exports = { createPainEntry, getPainHistory, getPainStats };
