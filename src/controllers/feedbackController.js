const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

async function getFeedback(req, res, next) {
  try {
    const { db } = await getDb();
    const { status } = req.query;
    if (status) {
      if (!['pending', 'reviewed', 'resolved'].includes(status)) {
        const e = new Error('status must be pending, reviewed or resolved'); e.status = 400; return next(e);
      }
      return res.json(queryAll(db,
        'SELECT f.*, u.name AS user_name, u.email AS user_email FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.status = ? ORDER BY f.created_at DESC',
        [status]
      ));
    }
    res.json(queryAll(db,
      'SELECT f.*, u.name AS user_name, u.email AS user_email FROM feedback f JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC'
    ));
  } catch (err) { next(err); }
}

async function getFeedbackById(req, res, next) {
  try {
    const { db } = await getDb();
    const row = queryOne(db,
      'SELECT f.*, u.name AS user_name, u.email AS user_email FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.id = ?',
      [req.params.id]
    );
    if (!row) { const e = new Error('Feedback not found'); e.status = 404; return next(e); }
    res.json(row);
  } catch (err) { next(err); }
}

async function createFeedback(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { userId, content } = req.body;
    if (!userId || !content) {
      const e = new Error('userId and content are required'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId])) {
      const e = new Error('User not found'); e.status = 404; return next(e);
    }
    const result = run(db, 'INSERT INTO feedback (user_id, content) VALUES (?, ?)', [userId, content]);
    save();
    res.status(201).json(queryOne(db, 'SELECT * FROM feedback WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { next(err); }
}

async function updateFeedback(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { status, response } = req.body;
    if (!status && response === undefined) {
      const e = new Error('at least one field is required: status, response'); e.status = 400; return next(e);
    }
    if (status && !['pending', 'reviewed', 'resolved'].includes(status)) {
      const e = new Error('status must be pending, reviewed or resolved'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM feedback WHERE id = ?', [req.params.id])) {
      const e = new Error('Feedback not found'); e.status = 404; return next(e);
    }
    const now = new Date().toISOString();
    const fields = ['updated_at = ?'];
    const values = [now];
    if (status)              { fields.push('status = ?');   values.push(status); }
    if (response !== undefined) { fields.push('response = ?'); values.push(response); }
    values.push(req.params.id);
    run(db, `UPDATE feedback SET ${fields.join(', ')} WHERE id = ?`, values);
    save();
    res.json(queryOne(db, 'SELECT * FROM feedback WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
}

module.exports = { getFeedback, getFeedbackById, createFeedback, updateFeedback };
