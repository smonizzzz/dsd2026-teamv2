const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

const PHASES = ['Warm Up', 'Strength', 'Mobility', 'Cooldown'];

// Serialises a schedule_exercises row to the shape M1 expects. holdSeconds/lastPainLevel
// are camelCase; gif_url/description/notes mirror M1's documented response. notes/gif_url/
// description are null (never omitted) when not set; holdSeconds is 0 (never null).
function exerciseView(row) {
  return {
    id: row.id,
    name: row.name,
    phase: row.phase,
    sets: row.sets,
    reps: row.reps,
    holdSeconds: row.hold_seconds,
    notes: row.notes ?? null,
    gif_url: row.gif_url ?? null,
    description: row.description ?? null,
    completed: Boolean(row.completed),
    lastPainLevel: row.last_pain_level ?? null
  };
}

// GET /schedule/:id/exercises — schedule metadata + the list of exercises inside it.
async function getExercises(req, res, next) {
  try {
    const { db } = await getDb();
    const schedule = queryOne(db, `
      SELECT s.*, d.name AS doctor_name
      FROM schedules s
      JOIN users p ON p.id = s.user_id
      LEFT JOIN users d ON d.id = p.doctor_id
      WHERE s.id = ?
    `, [req.params.id]);
    if (!schedule) { const e = new Error('Schedule item not found'); e.status = 404; return next(e); }

    const exercises = queryAll(db,
      'SELECT * FROM schedule_exercises WHERE schedule_id = ? ORDER BY id ASC',
      [req.params.id]
    ).map(exerciseView);

    res.json({
      scheduleId: schedule.id,
      exercise: schedule.exercise,
      date: schedule.date,
      duration: schedule.duration,
      notes: schedule.notes ?? '',
      video_url: schedule.video_url ?? null,
      status: schedule.status,
      doctorName: schedule.doctor_name ?? null,
      exercises
    });
  } catch (err) { next(err); }
}

// POST /schedule/:id/exercises — add an exercise to a schedule (used by the doctor / M2 side).
// Accepts camelCase (holdSeconds, gifUrl) and snake_case (hold_seconds, gif_url) from clients.
async function createExercise(req, res, next) {
  try {
    const { db, save } = await getDb();
    const b = req.body || {};
    const name = b.name;
    const phase = b.phase || 'Strength';
    const sets = b.sets ?? 1;
    const reps = b.reps ?? 1;
    const holdSeconds = b.holdSeconds ?? b.hold_seconds ?? 0;
    const notes = b.notes ?? null;
    const gifUrl = b.gif_url ?? b.gifUrl ?? null;
    const description = b.description ?? null;

    if (!name) { const e = new Error('name is required'); e.status = 400; return next(e); }
    if (!PHASES.includes(phase)) {
      const e = new Error(`phase must be one of: ${PHASES.join(', ')}`); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM schedules WHERE id = ?', [req.params.id])) {
      const e = new Error('Schedule item not found'); e.status = 404; return next(e);
    }

    const result = run(db, `
      INSERT INTO schedule_exercises (schedule_id, name, phase, sets, reps, hold_seconds, notes, gif_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.id, name, phase, Number(sets) || 1, Number(reps) || 1, Number(holdSeconds) || 0, notes, gifUrl, description]);
    save();

    res.status(201).json(exerciseView(queryOne(db, 'SELECT * FROM schedule_exercises WHERE id = ?', [result.lastInsertRowid])));
  } catch (err) { next(err); }
}

// PATCH /schedule/:id/exercises/:exerciseId/complete — mark one exercise done, with optional pain.
// Accepts both painLevel (camelCase) and pain_level (snake_case).
async function completeExercise(req, res, next) {
  try {
    const { db, save } = await getDb();
    const b = req.body || {};
    const painRaw = b.painLevel ?? b.pain_level;

    if (painRaw !== undefined && painRaw !== null) {
      const p = Number(painRaw);
      if (!Number.isInteger(p) || p < 1 || p > 10) {
        const e = new Error('painLevel must be an integer between 1 and 10'); e.status = 400; return next(e);
      }
    }

    const exercise = queryOne(db,
      'SELECT * FROM schedule_exercises WHERE id = ? AND schedule_id = ?',
      [req.params.exerciseId, req.params.id]
    );
    if (!exercise) { const e = new Error('Exercise not found'); e.status = 404; return next(e); }

    const completedAt = new Date().toISOString();
    const pain = (painRaw === undefined || painRaw === null) ? null : Number(painRaw);
    run(db, `
      UPDATE schedule_exercises
      SET completed = 1, last_pain_level = ?, completed_at = ?
      WHERE id = ?
    `, [pain, completedAt, req.params.exerciseId]);
    save();

    res.json({
      exerciseId: Number(req.params.exerciseId),
      completed: true,
      painLevel: pain,
      completedAt
    });
  } catch (err) { next(err); }
}

module.exports = { getExercises, createExercise, completeExercise };
