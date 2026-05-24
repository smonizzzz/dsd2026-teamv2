const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { ensureRole, ensureCanAccessSession } = require('../utils/accessControl');

function parseCurveData(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((point, index) => {
    if (typeof point === 'number') return { index, angle: point };
    return {
      index: point.index ?? index,
      timestamp: point.timestamp,
      phase: point.phase,
      angle: Number(point.angle ?? point.value)
    };
  }).filter(point => Number.isFinite(point.angle));
}

function parseJointAngles(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.reduce((out, item) => {
        const joint = item.joint || item.angleId || item.angleID || item.id || item.name;
        const angle = item.angle ?? item.value;
        if (joint && Number.isFinite(Number(angle))) out[joint] = Number(angle);
        return out;
      }, {});
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializeCurve(row) {
  return {
    ...row,
    curve_data: parseCurveData(row.curve_data)
  };
}

async function createStandardCurve(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db, save } = await getDb();
    const { doctorId, name, joint, curveData, notes = null, status = 'active' } = req.body;
    const resolvedDoctorId = req.user.role === 'admin' && doctorId ? Number(doctorId) : Number(req.user.id);

    if (!name || !joint || !Array.isArray(curveData) || curveData.length === 0) {
      const e = new Error('name, joint and curveData array are required');
      e.status = 400;
      return next(e);
    }
    if (!['active', 'archived'].includes(status)) {
      const e = new Error('status must be active or archived');
      e.status = 400;
      return next(e);
    }
    if (!queryOne(db, "SELECT id FROM users WHERE id = ? AND role = 'clinician' AND status = 'active'", [resolvedDoctorId])) {
      const e = new Error('Doctor not found or inactive');
      e.status = 404;
      return next(e);
    }

    const result = run(db, `
      INSERT INTO standard_curves (doctor_id, name, joint, curve_data, notes, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [resolvedDoctorId, name, joint, JSON.stringify(curveData), notes, status]);
    save();

    const created = queryOne(db, 'SELECT * FROM standard_curves WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(serializeCurve(created));
  } catch (err) { next(err); }
}

async function getStandardCurves(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db } = await getDb();
    const params = [];
    const where = [];

    if (req.user.role === 'clinician') {
      where.push('doctor_id = ?');
      params.push(req.user.id);
    } else if (req.query.doctorId) {
      where.push('doctor_id = ?');
      params.push(req.query.doctorId);
    }
    if (req.query.joint) {
      where.push('joint = ?');
      params.push(req.query.joint);
    }
    if (req.query.status) {
      where.push('status = ?');
      params.push(req.query.status);
    }

    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = queryAll(db, `
      SELECT * FROM standard_curves
      ${sqlWhere}
      ORDER BY created_at DESC
    `, params).map(serializeCurve);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getStandardCurveById(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db } = await getDb();
    const curve = queryOne(db, 'SELECT * FROM standard_curves WHERE id = ?', [req.params.id]);
    if (!curve) {
      const e = new Error('Standard curve not found');
      e.status = 404;
      return next(e);
    }
    if (req.user.role === 'clinician' && Number(curve.doctor_id) !== Number(req.user.id)) {
      const e = new Error('Forbidden');
      e.status = 403;
      return next(e);
    }
    res.json(serializeCurve(curve));
  } catch (err) { next(err); }
}

async function compareStandardCurve(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db } = await getDb();
    const { sessionId, curveId } = req.query;
    if (!sessionId || !curveId) {
      const e = new Error('sessionId and curveId are required');
      e.status = 400;
      return next(e);
    }

    const session = ensureCanAccessSession(db, req.user, sessionId);
    const curve = queryOne(db, 'SELECT * FROM standard_curves WHERE id = ?', [curveId]);
    if (!curve) {
      const e = new Error('Standard curve not found');
      e.status = 404;
      return next(e);
    }
    if (req.user.role === 'clinician' && Number(curve.doctor_id) !== Number(req.user.id)) {
      const e = new Error('Forbidden');
      e.status = 403;
      return next(e);
    }

    const curvePoints = parseCurveData(curve.curve_data);
    const measurements = queryAll(db, `
      SELECT id, timestamp, joint_angles
      FROM measurements
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `, [sessionId]);

    const samples = [];
    let totalAbsError = 0;
    let maxAbsError = 0;
    let compared = 0;

    measurements.forEach((measurement, index) => {
      const angle = Number(parseJointAngles(measurement.joint_angles)[curve.joint]);
      const standard = curvePoints[index] || curvePoints[curvePoints.length - 1];
      if (!Number.isFinite(angle) || !standard) return;

      const error = angle - standard.angle;
      const absError = Math.abs(error);
      totalAbsError += absError;
      maxAbsError = Math.max(maxAbsError, absError);
      compared++;
      samples.push({
        measurement_id: measurement.id,
        timestamp: measurement.timestamp,
        joint: curve.joint,
        actual_angle: angle,
        standard_angle: standard.angle,
        deviation: Math.round(error * 100) / 100
      });
    });

    res.json({
      session_id: Number(sessionId),
      patient_id: session.user_id,
      curve_id: Number(curveId),
      curve_name: curve.name,
      joint: curve.joint,
      samples_compared: compared,
      average_abs_deviation: compared ? Math.round((totalAbsError / compared) * 100) / 100 : null,
      max_abs_deviation: compared ? Math.round(maxAbsError * 100) / 100 : null,
      samples
    });
  } catch (err) { next(err); }
}

module.exports = {
  createStandardCurve,
  getStandardCurves,
  getStandardCurveById,
  compareStandardCurve
};
