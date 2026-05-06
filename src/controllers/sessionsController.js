const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { broadcastSessionEnded } = require('../realtime/feedbackSocket');

async function getSessions(req, res, next) {
  try {
    const { db } = await getDb();
    const { userId } = req.query;
    let sql = `
      SELECT s.*, u.name AS user_name, COUNT(m.id) AS measurement_count
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN measurements m ON m.session_id = s.id
    `;
    const params = [];
    if (userId) { sql += ' WHERE s.user_id = ?'; params.push(userId); }
    sql += ' GROUP BY s.id ORDER BY s.started_at DESC';
    res.json(queryAll(db, sql, params));
  } catch (err) { next(err); }
}

async function getSessionById(req, res, next) {
  try {
    const { db } = await getDb();
    const session = queryOne(db, `
      SELECT s.*, u.name AS user_name, u.email AS user_email
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `, [req.params.id]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }

    const measurements = queryAll(db,
      'SELECT * FROM measurements WHERE session_id = ? ORDER BY timestamp ASC',
      [req.params.id]
    ).map(m => ({
      ...m,
      joint_angles: JSON.parse(m.joint_angles),
      is_correct: Boolean(m.is_correct)
    }));

    res.json({ ...session, measurements });
  } catch (err) { next(err); }
}

async function createSession(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { userId } = req.body;
    if (!userId) { const e = new Error('userId is required'); e.status = 400; return next(e); }

    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const result = run(db, 'INSERT INTO sessions (user_id) VALUES (?)', [userId]);
    save();
    const created = queryOne(db, `
      SELECT s.*, u.name AS user_name FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.id = ?
    `, [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err) { next(err); }
}

async function endSession(req, res, next) {
  try {
    const { db, save } = await getDb();
    const session = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    if (session.ended_at) { const e = new Error('Session already closed'); e.status = 409; return next(e); }

    run(db, "UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?", [req.params.id]);
    save();
    const updated = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    broadcastSessionEnded({ sessionId: req.params.id, timestamp: updated.ended_at });
    res.json(updated);
  } catch (err) { next(err); }
}

async function deleteSession(req, res, next) {
  try {
    const { db, save } = await getDb();
    const session = queryOne(db, 'SELECT id FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }

    run(db, 'DELETE FROM measurements WHERE session_id = ?', [req.params.id]);
    run(db, 'DELETE FROM recommendations WHERE session_id = ?', [req.params.id]);
    run(db, 'DELETE FROM sessions WHERE id = ?', [req.params.id]);
    save();
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { getSessions, getSessionById, createSession, endSession, deleteSession };
