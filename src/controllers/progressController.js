const getDb = require('../db/connection');
const { queryAll, queryOne } = require('../db/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// GET /progress/:userId
// Returns the patient-facing progress shape consumed by the M1 mobile app
// (Overview / ROM / Pain tabs). Every metric below is computed from real stored
// data — sessions, measurements and schedule_exercises. Where our data model has
// no source for a value (e.g. a clinical ROM target) the field is returned as
// null/best-effort and noted; M1 degrades gracefully on null.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function round(value, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Monday 00:00 UTC of the week containing `date`.
function weekStart(date) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - day);
  return monday;
}

// Accepts both the object map {knee:45.2} and M1's array [{angleID, angle}].
function parseJointAngles(raw) {
  if (!raw) return {};
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
  if (Array.isArray(parsed)) {
    return parsed.reduce((out, item) => {
      const joint = item.joint || item.angleId || item.angleID || item.id || item.name;
      const angle = Number(item.angle ?? item.value);
      if (joint && Number.isFinite(angle)) out[joint] = angle;
      return out;
    }, {});
  }
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function maxAngle(anglesObj) {
  const values = Object.values(anglesObj).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function durationMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return ms > 0 ? ms / 60000 : null;
}

async function getProgressByUser(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { db } = await getDb();

    const user = queryOne(db, 'SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const sessions = queryAll(db, 'SELECT id, started_at, ended_at FROM sessions WHERE user_id = ? ORDER BY started_at ASC', [userId]);
    const measurements = queryAll(db, `
      SELECT m.timestamp, m.joint_angles
      FROM measurements m JOIN sessions s ON s.id = m.session_id
      WHERE s.user_id = ? ORDER BY m.timestamp ASC
    `, [userId]);
    const exercises = queryAll(db, `
      SELECT e.completed, e.last_pain_level, e.completed_at
      FROM schedule_exercises e JOIN schedules sc ON sc.id = e.schedule_id
      WHERE sc.user_id = ?
    `, [userId]);
    const schedules = queryAll(db, 'SELECT date, status FROM schedules WHERE user_id = ?', [userId]);

    const now = new Date();
    const thisWeekStart = weekStart(now);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY_MS);
    const todayKey = dateKey(now);

    // ── ROM (range of motion) — peak joint angle per day, aggregated by week ──
    const romByDate = {};
    let latestRom = null;
    for (const m of measurements) {
      const peak = maxAngle(parseJointAngles(m.joint_angles));
      if (peak === null) continue;
      const k = dateKey(m.timestamp);
      romByDate[k] = Math.max(romByDate[k] ?? -Infinity, peak);
      latestRom = peak; // measurements are time-ordered, so last wins
    }
    const romWeekly = {};
    for (const [k, deg] of Object.entries(romByDate)) {
      const wk = dateKey(weekStart(k));
      romWeekly[wk] = Math.max(romWeekly[wk] ?? -Infinity, deg);
    }
    const romHistory = Object.entries(romWeekly)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, degrees]) => ({ date, degrees: round(degrees) }))
      .slice(-8);
    const thisWeekRom = romWeekly[dateKey(thisWeekStart)] ?? null;
    const lastWeekRom = romWeekly[dateKey(lastWeekStart)] ?? null;
    const weeklyGain = (thisWeekRom !== null && lastWeekRom !== null) ? round(thisWeekRom - lastWeekRom) : null;

    // ── Adherence — from schedule_exercises ──
    const totalExercises = exercises.length;
    const completedExercises = exercises.filter(e => e.completed).length;
    const skippedExercises = Math.max(totalExercises - completedExercises, 0);

    const weekDays = DAY_LABELS.map((label, i) => {
      const d = new Date(thisWeekStart.getTime() + i * DAY_MS);
      const k = dateKey(d);
      const done = exercises.some(e => e.completed && e.completed_at && dateKey(e.completed_at) === k);
      return { day: label, done, isToday: k === todayKey };
    });

    // Streak: consecutive weeks (ending this week) with at least one completed exercise.
    const completedWeeks = new Set(
      exercises.filter(e => e.completed && e.completed_at).map(e => dateKey(weekStart(e.completed_at)))
    );
    let streakWeeks = 0;
    let cursor = new Date(thisWeekStart);
    while (completedWeeks.has(dateKey(cursor))) {
      streakWeeks++;
      cursor = new Date(cursor.getTime() - 7 * DAY_MS);
    }

    const weeklyPercent = totalExercises ? Math.round((completedExercises / totalExercises) * 100) : 0;

    // ── Pain — from last_pain_level on completed exercises ──
    const painByDate = {};
    for (const e of exercises) {
      if (e.last_pain_level == null || !e.completed_at) continue;
      const k = dateKey(e.completed_at);
      (painByDate[k] = painByDate[k] || []).push(Number(e.last_pain_level));
    }
    const painDaily = [];
    for (let i = 6; i >= 0; i--) {
      const k = dateKey(new Date(now.getTime() - i * DAY_MS));
      const levels = painByDate[k] || [];
      painDaily.push({ date: k, level: levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0 });
    }
    const avgPainInRange = (start, end) => {
      const levels = exercises
        .filter(e => e.last_pain_level != null && e.completed_at)
        .filter(e => { const t = new Date(e.completed_at).getTime(); return t >= start.getTime() && t < end.getTime(); })
        .map(e => Number(e.last_pain_level));
      return levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
    };
    const painThisWeek = avgPainInRange(thisWeekStart, new Date(thisWeekStart.getTime() + 7 * DAY_MS));
    const painLastWeek = avgPainInRange(lastWeekStart, thisWeekStart);

    // ── Weekly summary — from sessions in the current week ──
    const sessionsThisWeek = sessions.filter(s => {
      const t = new Date(s.started_at).getTime();
      return t >= thisWeekStart.getTime() && t < thisWeekStart.getTime() + 7 * DAY_MS;
    });
    const sessionMinutes = sessionsThisWeek.map(s => durationMinutes(s.started_at, s.ended_at)).filter(v => v !== null);
    const avgSessionMinutes = sessionMinutes.length ? Math.round(sessionMinutes.reduce((a, b) => a + b, 0) / sessionMinutes.length) : 0;
    const activeDays = new Set(sessionsThisWeek.map(s => dateKey(s.started_at))).size;

    // ── Week label — derived from the schedule/session date span (best effort) ──
    const allDates = [...schedules.map(s => s.date), ...sessions.map(s => s.started_at)].filter(Boolean).map(d => new Date(d));
    let weekLabel = 'Week 1';
    if (allDates.length) {
      const firstStart = weekStart(new Date(Math.min(...allDates.map(d => d.getTime()))));
      const lastStart = weekStart(new Date(Math.max(...allDates.map(d => d.getTime()), now.getTime())));
      const currentWeek = Math.floor((thisWeekStart.getTime() - firstStart.getTime()) / (7 * DAY_MS)) + 1;
      const totalWeeks = Math.max(currentWeek, Math.floor((lastStart.getTime() - firstStart.getTime()) / (7 * DAY_MS)) + 1);
      weekLabel = `Week ${currentWeek} of ${totalWeeks}`;
    }

    res.json({
      userId,
      generated_at: new Date().toISOString(),
      weekLabel,
      rom: {
        currentDegrees: latestRom !== null ? round(latestRom) : 0,
        targetDegrees: null, // no clinical ROM target stored in V2 yet
        weeklyGainDegrees: weeklyGain ?? 0,
        history: romHistory
      },
      adherence: {
        weeklyPercent,
        completedExercises,
        totalExercises,
        skippedExercises,
        streakWeeks,
        weekDays
      },
      pain: {
        averageThisWeek: painThisWeek !== null ? Math.round(painThisWeek) : 0,
        changeFromLastWeek: (painThisWeek !== null && painLastWeek !== null) ? Math.round(painThisWeek - painLastWeek) : 0,
        daily: painDaily
      },
      weeklySummary: {
        avgSessionMinutes,
        activeDays,
        romGainDegrees: weeklyGain ?? 0
      }
    });
  } catch (err) { next(err); }
}

module.exports = { getProgressByUser };
