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
      const users = queryAll(db, 'SELECT id, name, email, role, age, status, created_at FROM users WHERE role = ? ORDER BY created_at DESC', [role]);
      return res.json(users);
    }
    const users = queryAll(db, 'SELECT id, name, email, role, age, status, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) { next(err); }
}

async function getUserById(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, `
      SELECT u.id, u.name, u.email, u.role, u.age, u.status, u.created_at, COUNT(s.id) AS session_count
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
    const { name, age, role, status } = req.body;

    if (!name && age === undefined && !role && !status) {
      const e = new Error('at least one field is required: name, age, role, status'); e.status = 400; return next(e);
    }
    if (role && !['patient', 'clinician'].includes(role)) {
      const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
    }
    if (status && !['active', 'pending', 'disabled', 'rejected'].includes(status)) {
      const e = new Error('status must be active, pending, disabled or rejected'); e.status = 400; return next(e);
    }

    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const fields = [];
    const values = [];
    if (name)            { fields.push('name = ?');   values.push(name); }
    if (age !== undefined) { fields.push('age = ?');  values.push(age); }
    if (role)            { fields.push('role = ?');   values.push(role); }
    if (status)          { fields.push('status = ?'); values.push(status); }
    values.push(req.params.id);

    run(db, `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    logAudit(db, { userId: req.user?.id, action: 'UPDATE_USER', targetType: 'user', targetId: req.params.id, details: req.body });
    save();

    const updated = queryOne(db, 'SELECT id, name, email, role, age, status, created_at FROM users WHERE id = ?', [req.params.id]);
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

module.exports = { getUsers, getUserById, createUser, updateUser, getPatients, getPatientById };
