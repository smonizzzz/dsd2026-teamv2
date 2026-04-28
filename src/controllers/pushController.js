const getDb = require('../db/connection');
const { queryOne, queryAll, run } = require('../db/helpers');

async function registerToken(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { userId, token, platform } = req.body;

    if (!userId || !token) {
      const e = new Error('userId and token are required'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId])) {
      const e = new Error('User not found'); e.status = 404; return next(e);
    }

    // Upsert: if (userId, token) already exists do nothing, otherwise insert
    const existing = queryOne(db,
      'SELECT id FROM push_tokens WHERE user_id = ? AND token = ?',
      [userId, token]
    );
    if (!existing) {
      run(db,
        'INSERT INTO push_tokens (user_id, token, platform) VALUES (?, ?, ?)',
        [userId, token, platform || null]
      );
      save();
    }

    res.status(201).json({ message: 'Push token registered', userId, token });
  } catch (err) { next(err); }
}

async function getTokens(req, res, next) {
  try {
    const { db } = await getDb();
    const rows = queryAll(db,
      'SELECT * FROM push_tokens WHERE user_id = ? ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { registerToken, getTokens };
