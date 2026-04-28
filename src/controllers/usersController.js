const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

async function getUsers(req, res, next) {
  try {
    const { db } = await getDb();
    const users = queryAll(db, 'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) { next(err); }
}

async function getUserById(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, `
      SELECT u.id, u.name, u.email, u.role, u.created_at, COUNT(s.id) AS session_count
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
    const { name, email, role = 'patient' } = req.body;

    if (!name || !email) {
      const e = new Error('name and email are required'); e.status = 400; return next(e);
    }
    if (!['patient', 'clinician'].includes(role)) {
      const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
    }

    // Check for duplicate email
    const existing = queryOne(db, 'SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      const e = new Error('Email already exists'); e.status = 409; return next(e);
    }

    const result = run(db, 'INSERT INTO users (name, email, role) VALUES (?, ?, ?)', [name, email, role]);
    save();
    const created = queryOne(db, 'SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err) { next(err); }
}

module.exports = { getUsers, getUserById, createUser };
