const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { broadcastMovementFeedback } = require('../realtime/feedbackSocket');

// Serialises a stored measurement row to a response. `joint_angles` holds whatever the
// client sent (either an object map {knee:45} or M1's targetAngles array); we expose it
// under both `joint_angles` (legacy) and `target_angles` (M1). errors/sensor_data are
// always arrays so M1 can iterate them without null guards.
function measurementView(row) {
  const angles = JSON.parse(row.joint_angles);
  return {
    id: row.id,
    session_id: row.session_id,
    timestamp: row.timestamp,
    joint_angles: angles,
    target_angles: angles,
    errors: [],
    sensor_data: row.sensor_data ? JSON.parse(row.sensor_data) : [],
    is_correct: Boolean(row.is_correct)
  };
}

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

    res.json(queryAll(db, sql, params).map(measurementView));
  } catch (err) { next(err); }
}

async function createMeasurement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, jointAngles, targetAngles, sensorData, isCorrect = false, timestamp } = req.body;

    // M1 sends targetAngles + sensorData; S2/legacy send jointAngles. Accept either.
    const angles = targetAngles ?? jointAngles;
    if (!sessionId || !angles) {
      const e = new Error('sessionId and jointAngles (or targetAngles) are required'); e.status = 400; return next(e);
    }

    const session = queryOne(db, 'SELECT id, ended_at FROM sessions WHERE id = ?', [sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    if (session.ended_at) { const e = new Error('Session is closed'); e.status = 409; return next(e); }

    const ts = timestamp || (Array.isArray(targetAngles) && targetAngles[0] && targetAngles[0].timestamp) || new Date().toISOString();
    const result = run(db, `
      INSERT INTO measurements (session_id, joint_angles, is_correct, timestamp, sensor_data)
      VALUES (?, ?, ?, ?, ?)
    `, [sessionId, JSON.stringify(angles), isCorrect ? 1 : 0, ts, sensorData ? JSON.stringify(sensorData) : null]);
    save();

    broadcastMovementFeedback({ sessionId, timestamp: ts, isCorrect, jointAngles: angles });
    res.status(201).json(measurementView(queryOne(db, 'SELECT * FROM measurements WHERE id = ?', [result.lastInsertRowid])));
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
      const angles = m.targetAngles ?? m.jointAngles;
      if (!angles) continue;
      const ts = m.timestamp || (Array.isArray(m.targetAngles) && m.targetAngles[0] && m.targetAngles[0].timestamp) || new Date().toISOString();
      run(db, `
        INSERT INTO measurements (session_id, joint_angles, is_correct, timestamp, sensor_data)
        VALUES (?, ?, ?, ?, ?)
      `, [sessionId, JSON.stringify(angles), m.isCorrect ? 1 : 0, ts, m.sensorData ? JSON.stringify(m.sensorData) : null]);
      broadcastMovementFeedback({ sessionId, timestamp: ts, isCorrect: m.isCorrect, jointAngles: angles });
    }
    save();

    res.status(201).json({ inserted: measurements.length, sessionId });
  } catch (err) { next(err); }
}

async function createRawMeasurement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, targetAngles, sensorData } = req.body;

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

    broadcastMovementFeedback({ sessionId, timestamp: ts, isCorrect: false, jointAngles: {} });
    res.status(201).json(measurementView(queryOne(db, 'SELECT * FROM measurements WHERE id = ?', [result.lastInsertRowid])));
  } catch (err) { next(err); }
}

module.exports = { getMeasurementsBySession, createMeasurement, createMeasurementsBatch, createRawMeasurement };
