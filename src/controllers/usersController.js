const path  = require('path');
const fs    = require('fs');
const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { logAudit } = require('../db/audit');

async function getUsers(req, res, next) {
  try {
    const { db } = await getDb();
    const { role } = req.query;
    if (role) {
      if (!['patient', 'clinician'].includes(role)) {
        const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
      }
      const users = queryAll(db, 'SELECT id, name, email, role, age, status, COALESCE(doctor_id, 0) AS doctor_id, created_at FROM users WHERE role = ? ORDER BY created_at DESC', [role]);
      return res.json(users);
    }
    const users = queryAll(db, 'SELECT id, name, email, role, age, status, COALESCE(doctor_id, 0) AS doctor_id, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) { next(err); }
}

async function getUserById(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, `
      SELECT u.id, u.name, u.email, u.role, u.age, u.status, COALESCE(u.doctor_id, 0) AS doctor_id, u.created_at, COUNT(s.id) AS session_count
      FROM users u LEFT JOIN sessions s ON s.user_id = u.id
      WHERE u.id = ? GROUP BY u.id
    `, [req.params.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }
    res.json(user);
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { name, email, role = 'patient', age } = req.body;

    if (!name || !email) {
      const e = new Error('name and email are required'); e.status = 400; return next(e);
    }
    if (!['patient', 'clinician'].includes(role)) {
      const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
    }
    if (queryOne(db, 'SELECT id FROM users WHERE email = ?', [email])) {
      const e = new Error('Email already exists'); e.status = 409; return next(e);
    }

    const result = run(db, 'INSERT INTO users (name, email, role, age) VALUES (?, ?, ?, ?)', [name, email, role, age || null]);
    save();
    const created = queryOne(db, 'SELECT id, name, email, role, age, status, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { name, age, role, status, doctorId, conditionLabel, conditionDate } = req.body;

    const hasDoctorId = doctorId !== undefined;
    if (!name && age === undefined && !role && !status && !hasDoctorId && conditionLabel === undefined && conditionDate === undefined) {
      const e = new Error('at least one field is required: name, age, role, status, doctorId, conditionLabel, conditionDate'); e.status = 400; return next(e);
    }
    if (role && !['patient', 'clinician'].includes(role)) {
      const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
    }
    if (status && !['active', 'pending', 'disabled', 'rejected'].includes(status)) {
      const e = new Error('status must be active, pending, disabled or rejected'); e.status = 400; return next(e);
    }

    const user = queryOne(db, 'SELECT id, doctor_id FROM users WHERE id = ?', [req.params.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    // Doctor binding: validate the target is an active clinician before binding the patient.
    if (hasDoctorId) {
      const parsedDoctorId = Number(doctorId);
      if (!Number.isInteger(parsedDoctorId) || parsedDoctorId <= 0) {
        const e = new Error('doctorId must be a positive integer'); e.status = 400; return next(e);
      }
      const doctor = queryOne(db, 'SELECT id, role FROM users WHERE id = ?', [parsedDoctorId]);
      if (!doctor) { const e = new Error('Doctor not found'); e.status = 404; return next(e); }
      if (doctor.role !== 'clinician') { const e = new Error('Target user is not a clinician'); e.status = 403; return next(e); }
      if (Number(user.doctor_id) === parsedDoctorId) {
        const e = new Error('Patient is already bound to this doctor'); e.status = 409; return next(e);
      }
    }

    const fields = [];
    const values = [];
    if (name)                      { fields.push('name = ?');            values.push(name); }
    if (age !== undefined)         { fields.push('age = ?');             values.push(age); }
    if (role)                      { fields.push('role = ?');            values.push(role); }
    if (status)                    { fields.push('status = ?');          values.push(status); }
    if (hasDoctorId)               { fields.push('doctor_id = ?');       values.push(Number(doctorId)); }
    if (conditionLabel !== undefined) { fields.push('condition_label = ?'); values.push(conditionLabel); }
    if (conditionDate !== undefined)  { fields.push('condition_date = ?');  values.push(conditionDate); }
    values.push(req.params.id);

    run(db, `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    logAudit(db, { userId: req.user?.id, action: 'UPDATE_USER', targetType: 'user', targetId: req.params.id, details: req.body });
    save();

    const updated = queryOne(db, 'SELECT id, name, email, role, age, status, COALESCE(doctor_id, 0) AS doctor_id, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { next(err); }
}

async function getPatients(req, res, next) {
  try {
    const { db } = await getDb();
    const patients = queryAll(db,
      'SELECT id, name, email, role, age, status, created_at FROM users WHERE role = ? ORDER BY created_at DESC',
      ['patient']
    );
    res.json(patients);
  } catch (err) { next(err); }
}

async function getPatientById(req, res, next) {
  try {
    const { db } = await getDb();
    const patient = queryOne(db, `
      SELECT u.id, u.name, u.email, u.role, u.age, u.status, u.created_at, COUNT(s.id) AS session_count
      FROM users u LEFT JOIN sessions s ON s.user_id = u.id
      WHERE u.id = ? AND u.role = 'patient' GROUP BY u.id
    `, [req.params.id]);
    if (!patient) { const e = new Error('Patient not found'); e.status = 404; return next(e); }
    res.json(patient);
  } catch (err) { next(err); }
}

async function getLicense(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT license_path FROM users WHERE id = ?', [req.params.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }
    if (!user.license_path) { const e = new Error('No license on file for this user'); e.status = 404; return next(e); }

    const absPath = path.resolve(user.license_path);
    if (!fs.existsSync(absPath)) { const e = new Error('License file not found on server'); e.status = 404; return next(e); }

    res.download(absPath);
  } catch (err) { next(err); }
}

async function updateLicense(req, res, next) {
  try {
    const { db, save } = await getDb();

    if (!req.file) {
      const e = new Error('license file is required'); e.status = 400; return next(e);
    }

    const user = queryOne(db, 'SELECT id, role, status FROM users WHERE id = ?', [req.params.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }
    if (user.role !== 'clinician') {
      const e = new Error('Only clinician users can upload a license'); e.status = 400; return next(e);
    }
    if (!['pending', 'rejected'].includes(user.status)) {
      const e = new Error('License can only be replaced while account is pending or rejected'); e.status = 409; return next(e);
    }

    run(db, "UPDATE users SET license_path = ?, status = 'pending' WHERE id = ?", [req.file.path, req.params.id]);
    logAudit(db, { userId: req.user?.id, action: 'UPDATE_LICENSE', targetType: 'user', targetId: req.params.id });
    save();

    res.json({ userId: user.id, role: user.role, status: 'pending' });
  } catch (err) { next(err); }
}

module.exports = { getUsers, getUserById, createUser, updateUser, getLicense, updateLicense, getPatients, getPatientById };
