const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

async function getSchedule(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [req.params.userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const rows = queryAll(db,
      'SELECT * FROM schedules WHERE user_id = ? ORDER BY date ASC',
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { userId, exercise, date, duration = 30, notes = null, status = 'pending' } = req.body;

    if (!userId || !exercise || !date) {
      const e = new Error('userId, exercise and date are required'); e.status = 400; return next(e);
    }
    if (!['pending', 'completed', 'skipped'].includes(status)) {
      const e = new Error('status must be pending, completed or skipped'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId])) {
      const e = new Error('User not found'); e.status = 404; return next(e);
    }

    const result = run(db,
      'INSERT INTO schedules (user_id, exercise, date, duration, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, exercise, date, duration, notes, status]
    );
    save();
    res.status(201).json(queryOne(db, 'SELECT * FROM schedules WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { next(err); }
}

async function updateScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    const item = queryOne(db, 'SELECT * FROM schedules WHERE id = ?', [req.params.id]);
    if (!item) { const e = new Error('Schedule item not found'); e.status = 404; return next(e); }

    const { exercise, date, duration, notes, status } = req.body;
    if (status && !['pending', 'completed', 'skipped'].includes(status)) {
      const e = new Error('status must be pending, completed or skipped'); e.status = 400; return next(e);
    }

    run(db, `UPDATE schedules SET
      exercise = ?, date = ?, duration = ?, notes = ?, status = ?
      WHERE id = ?`,
      [
        exercise ?? item.exercise,
        date     ?? item.date,
        duration ?? item.duration,
        notes    !== undefined ? notes : item.notes,
        status   ?? item.status,
        req.params.id
      ]
    );
    save();
    res.json(queryOne(db, 'SELECT * FROM schedules WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
}

async function deleteScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    if (!queryOne(db, 'SELECT id FROM schedules WHERE id = ?', [req.params.id])) {
      const e = new Error('Schedule item not found'); e.status = 404; return next(e);
    }
    run(db, 'DELETE FROM schedules WHERE id = ?', [req.params.id]);
    save();
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem };
