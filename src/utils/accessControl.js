const { queryOne } = require('../db/helpers');

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureRole(user, roles) {
  if (!user || !roles.includes(user.role)) {
    throw httpError('Forbidden', 403);
  }
}

function canAccessPatient(user, patient) {
  if (!user || !patient) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'clinician') return Number(patient.doctor_id) === Number(user.id);
  if (user.role === 'patient') return Number(patient.id) === Number(user.id);
  return false;
}

function ensureCanAccessPatient(db, user, patientId) {
  const patient = queryOne(db, `
    SELECT id, name, email, role, age, status, doctor_id, created_at
    FROM users
    WHERE id = ? AND role = 'patient'
  `, [patientId]);

  if (!patient) throw httpError('Patient not found', 404);
  if (!canAccessPatient(user, patient)) throw httpError('Forbidden', 403);
  return patient;
}

function ensureCanAccessSession(db, user, sessionId) {
  const session = queryOne(db, `
    SELECT s.*, u.doctor_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `, [sessionId]);

  if (!session) throw httpError('Session not found', 404);
  if (!canAccessPatient(user, { id: session.user_id, doctor_id: session.doctor_id })) {
    throw httpError('Forbidden', 403);
  }
  return session;
}

module.exports = {
  httpError,
  ensureRole,
  canAccessPatient,
  ensureCanAccessPatient,
  ensureCanAccessSession
};
