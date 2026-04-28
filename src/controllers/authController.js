const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const getDb    = require('../db/connection');
const { queryOne, run } = require('../db/helpers');
const { JWT_SECRET } = require('../middleware/auth');

async function register(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { name, email, password, role = 'patient' } = req.body;

    if (!name || !email || !password) {
      const e = new Error('name, email and password are required'); e.status = 400; return next(e);
    }
    if (!['patient', 'clinician'].includes(role)) {
      const e = new Error('role must be patient or clinician'); e.status = 400; return next(e);
    }
    if (queryOne(db, 'SELECT id FROM users WHERE email = ?', [email])) {
      const e = new Error('Email already exists'); e.status = 409; return next(e);
    }

    const hash   = bcrypt.hashSync(password, 10);
    const result = run(db, 'INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)', [name, email, role, hash]);
    save();

    const user  = queryOne(db, 'SELECT id, name, email, role, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { db } = await getDb();
    const { email, password } = req.body;

    if (!email || !password) {
      const e = new Error('email and password are required'); e.status = 400; return next(e);
    }

    const user = queryOne(db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !user.password) {
      const e = new Error('Invalid credentials'); e.status = 401; return next(e);
    }
    if (!bcrypt.compareSync(password, user.password)) {
      const e = new Error('Invalid credentials'); e.status = 401; return next(e);
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }
    res.json(user);
  } catch (err) { next(err); }
}

module.exports = { register, login, me };
