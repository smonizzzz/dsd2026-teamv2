const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { broadcastMovementFeedback } = require('../realtime/feedbackSocket');

async function getMeasurementsBySession(req, res, next) {
  try {
    const { db } = await getDb();
    const session = queryOne(db, 'SELECT id FROM sessions WHERE id = ?', [req.params.sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }

    const { startDate, endDate } = req.query;
    let sql = 'SELECT * FROM measurements WHERE session_id = ?';
    const params = [req.params.sessionId];

    if (startDate) {
      const start = startDate.includes('T') ? startDate : startDate + 'T00:00:00.000Z';
      sql += ' AND timestamp >= ?';
      params.push(start);
    }
    if (endDate) {
      const end = endDate.includes('T') ? endDate : endDate + 'T23:59:59.999Z';
      sql += ' AND timestamp <= ?';
      params.push(end);
    }
    sql += ' ORDER BY timestamp ASC';

    const rows = queryAll(db, sql, params)
      .map(m => ({
        ...m,
        joint_angles: JSON.parse(m.joint_angles),
        sensor_data: m.sensor_data ? JSON.parse(m.sensor_data) : null,
        is_correct: Boolean(m.is_correct)
      }));

    res.json(rows);
  } catch (err) { next(err); }
}

async function createMeasurement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, jointAngles, isCorrect = false, timestamp } = req.body;

    if (!sessionId || !jointAngles) {
      const e = new Error('sessionId and jointAngles are required'); e.status = 400; return next(e);
    }

    const session = queryOne(db, 'SELECT id, ended_at FROM sessions WHERE id = ?', [sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    if (session.ended_at) { const e = new Error('Session is closed'); e.status = 409; return next(e); }

    const ts = timestamp || new Date().toISOString();
    const result = run(db, `
      INSERT INTO measurements (session_id, joint_angles, is_correct, timestamp)
      VALUES (?, ?, ?, ?)
    `, [sessionId, JSON.stringify(jointAngles), isCorrect ? 1 : 0, ts]);
    save();

    const created = queryOne(db, 'SELECT * FROM measurements WHERE id = ?', [result.lastInsertRowid]);
    broadcastMovementFeedback({ sessionId, timestamp: ts, isCorrect, jointAngles });
    res.status(201).json({
      ...created,
      joint_angles: JSON.parse(created.joint_angles),
      is_correct: Boolean(created.is_correct)
    });
  } catch (err) { next(err); }
}

async function createMeasurementsBatch(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, measurements } = req.body;

    if (!sessionId || !Array.isArray(measurements) || measurements.length === 0) {
      const e = new Error('sessionId and measurements array are required'); e.status = 400; return next(e);
    }

    const session = queryOne(db, 'SELECT id, ended_at FROM sessions WHERE id = ?', [sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    if (session.ended_at) { const e = new Error('Session is closed'); e.status = 409; return next(e); }

    for (const m of measurements) {
      const ts = m.timestamp || new Date().toISOString();
      run(db, `
        INSERT INTO measurements (session_id, joint_angles, is_correct, timestamp)
        VALUES (?, ?, ?, ?)
      `, [sessionId, JSON.stringify(m.jointAngles), m.isCorrect ? 1 : 0, ts]);
      broadcastMovementFeedback({
        sessionId,
        timestamp: ts,
        isCorrect: m.isCorrect,
        jointAngles: m.jointAngles
      });
    }
    save();

    res.status(201).json({ inserted: measurements.length, sessionId });
  } catch (err) { next(err); }
}

async function createRawMeasurement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, targetAngles, sensorData, errors } = req.body;

    if (!sessionId || !Array.isArray(targetAngles) || targetAngles.length === 0) {
      const e = new Error('sessionId and targetAngles array are required'); e.status = 400; return next(e);
    }

    const session = queryOne(db, 'SELECT id, ended_at FROM sessions WHERE id = ?', [sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    if (session.ended_at) { const e = new Error('Session is closed'); e.status = 409; return next(e); }

    const ts = targetAngles[0].timestamp || new Date().toISOString();
    const result = run(db, `
      INSERT INTO measurements (session_id, joint_angles, is_correct, timestamp, sensor_data)
      VALUES (?, ?, 0, ?, ?)
    `, [sessionId, JSON.stringify(targetAngles), ts, sensorData ? JSON.stringify(sensorData) : null]);
    save();

    const created = queryOne(db, 'SELECT * FROM measurements WHERE id = ?', [result.lastInsertRowid]);
    broadcastMovementFeedback({ sessionId, timestamp: ts, isCorrect: false, jointAngles: {} });
    res.status(201).json({
      ...created,
      joint_angles: JSON.parse(created.joint_angles),
      sensor_data: created.sensor_data ? JSON.parse(created.sensor_data) : null,
      is_correct: false
    });
  } catch (err) { next(err); }
}

module.exports = { getMeasurementsBySession, createMeasurement, createMeasurementsBatch, createRawMeasurement };
