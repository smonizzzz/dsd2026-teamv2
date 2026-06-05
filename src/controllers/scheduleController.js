const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

// Normalises a schedule row to the exact shape M1 expects:
// notes is always a string (never null); video_url and doctor_name are always present (null allowed).
function scheduleView(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    exercise: row.exercise,
    date: row.date,
    duration: row.duration,
    notes: row.notes ?? '',
    video_url: row.video_url ?? null,
    status: row.status,
    doctor_name: row.doctor_name ?? null,
    created_at: row.created_at
  };
}

// Re-reads a single schedule row joined with the patient's doctor, for response serialisation.
function readScheduleView(db, id) {
  const row = queryOne(db, `
    SELECT s.*, d.name AS doctor_name
    FROM schedules s
    JOIN users p ON p.id = s.user_id
    LEFT JOIN users d ON d.id = p.doctor_id
    WHERE s.id = ?
  `, [id]);
  return row ? scheduleView(row) : null;
}

async function getSchedule(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [req.params.userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const rows = queryAll(db, `
      SELECT s.*, d.name AS doctor_name
      FROM schedules s
      JOIN users p ON p.id = s.user_id
      LEFT JOIN users d ON d.id = p.doctor_id
      WHERE s.user_id = ?
      ORDER BY s.date ASC
    `, [req.params.userId]);
    res.json(rows.map(scheduleView));
  } catch (err) { next(err); }
}

async function createScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { userId, exercise, date, duration = 30, notes = null, videoUrl = null, status = 'pending' } = req.body;

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
      'INSERT INTO schedules (user_id, exercise, date, duration, notes, video_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, exercise, date, duration, notes, videoUrl, status]
    );
    save();
    res.status(201).json(readScheduleView(db, result.lastInsertRowid));
  } catch (err) { next(err); }
}

async function updateScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    const item = queryOne(db, 'SELECT * FROM schedules WHERE id = ?', [req.params.id]);
    if (!item) { const e = new Error('Schedule item not found'); e.status = 404; return next(e); }

    const { exercise, date, duration, notes, videoUrl, status } = req.body;
    if (status && !['pending', 'completed', 'skipped'].includes(status)) {
      const e = new Error('status must be pending, completed or skipped'); e.status = 400; return next(e);
    }
    if (status === 'completed' && item.status === 'completed') {
      const e = new Error('Schedule item already completed'); e.status = 409; return next(e);
    }

    run(db, `UPDATE schedules SET
      exercise = ?, date = ?, duration = ?, notes = ?, video_url = ?, status = ?
      WHERE id = ?`,
      [
        exercise ?? item.exercise,
        date     ?? item.date,
        duration ?? item.duration,
        notes    !== undefined ? notes : item.notes,
        videoUrl !== undefined ? videoUrl : item.video_url,
        status   ?? item.status,
        req.params.id
      ]
    );
    save();
    res.json(readScheduleView(db, req.params.id));
  } catch (err) { next(err); }
}

async function deleteScheduleItem(req, res, next) {
  try {
    const { db, save } = await getDb();
    if (!queryOne(db, 'SELECT id FROM schedules WHERE id = ?', [req.params.id])) {
      const e = new Error('Schedule item not found'); e.status = 404; return next(e);
    }
    run(db, 'DELETE FROM schedule_exercises WHERE schedule_id = ?', [req.params.id]);
    run(db, 'DELETE FROM schedules WHERE id = ?', [req.params.id]);
    save();
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem };
