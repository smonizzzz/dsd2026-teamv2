const getDb = require('../db/connection');
const { queryAll, queryOne } = require('../db/helpers');

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function durationMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) return null;
  return round((ended - started) / 60000, 1);
}

function accuracyPercent(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function parseJointAngles(raw) {
  if (!raw) return {};

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }

  if (Array.isArray(parsed)) {
    return parsed.reduce((out, item) => {
      const joint = item.joint || item.angleId || item.angleID || item.id || item.name;
      const angle = item.angle ?? item.value;
      if (joint && typeof angle === 'number') out[joint] = angle;
      return out;
    }, {});
  }

  if (parsed && typeof parsed === 'object') return parsed;
  return {};
}

async function getProgressByUser(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { db } = await getDb();

    const user = queryOne(db, 'SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      const e = new Error('User not found');
      e.status = 404;
      return next(e);
    }

    const sessions = queryAll(db, `
      SELECT s.id, s.user_id, s.started_at, s.ended_at,
             COUNT(m.id) AS measurement_count,
             SUM(CASE WHEN m.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
      FROM sessions s
      LEFT JOIN measurements m ON m.session_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.started_at DESC
    `, [userId]);

    const measurements = queryAll(db, `
      SELECT m.*, s.user_id
      FROM measurements m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.user_id = ?
      ORDER BY m.timestamp ASC
    `, [userId]);

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.ended_at).length;
    const activeSessions = totalSessions - completedSessions;
    const totalMeasurements = measurements.length;
    const correctMeasurements = measurements.filter(m => Boolean(m.is_correct)).length;
    const incorrectMeasurements = totalMeasurements - correctMeasurements;

    const totalMinutes = sessions.reduce((sum, session) => {
      const minutes = durationMinutes(session.started_at, session.ended_at);
      return sum + (minutes || 0);
    }, 0);

    const jointStats = {};
    const dailyStats = {};

    for (const measurement of measurements) {
      const isCorrect = Boolean(measurement.is_correct);
      const date = (measurement.timestamp || '').slice(0, 10) || 'unknown';

      if (!dailyStats[date]) {
        dailyStats[date] = { date, measurements: 0, correct_measurements: 0, sessions: new Set() };
      }
      dailyStats[date].measurements++;
      dailyStats[date].sessions.add(measurement.session_id);
      if (isCorrect) dailyStats[date].correct_measurements++;

      const angles = parseJointAngles(measurement.joint_angles);
      for (const [joint, angle] of Object.entries(angles)) {
        if (typeof angle !== 'number') continue;
        if (!jointStats[joint]) {
          jointStats[joint] = {
            joint,
            total_measurements: 0,
            correct_measurements: 0,
            angle_sum: 0,
            latest_angle: null,
            latest_timestamp: null
          };
        }

        jointStats[joint].total_measurements++;
        jointStats[joint].angle_sum += angle;
        jointStats[joint].latest_angle = angle;
        jointStats[joint].latest_timestamp = measurement.timestamp;
        if (isCorrect) jointStats[joint].correct_measurements++;
      }
    }

    const recentSessions = sessions.slice(0, 10).map(session => ({
      id: session.id,
      started_at: session.started_at,
      ended_at: session.ended_at,
      status: session.ended_at ? 'completed' : 'active',
      duration_minutes: durationMinutes(session.started_at, session.ended_at),
      measurement_count: session.measurement_count || 0,
      correct_measurements: session.correct_count || 0,
      accuracy_percent: accuracyPercent(session.correct_count || 0, session.measurement_count || 0)
    }));

    const jointProgress = Object.values(jointStats)
      .map(stat => ({
        joint: stat.joint,
        total_measurements: stat.total_measurements,
        correct_measurements: stat.correct_measurements,
        accuracy_percent: accuracyPercent(stat.correct_measurements, stat.total_measurements),
        average_angle: round(stat.angle_sum / stat.total_measurements, 2),
        latest_angle: stat.latest_angle,
        latest_timestamp: stat.latest_timestamp
      }))
      .sort((a, b) => a.accuracy_percent - b.accuracy_percent || a.joint.localeCompare(b.joint));

    const dailyTrend = Object.values(dailyStats)
      .map(day => ({
        date: day.date,
        sessions: day.sessions.size,
        measurements: day.measurements,
        correct_measurements: day.correct_measurements,
        accuracy_percent: accuracyPercent(day.correct_measurements, day.measurements)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      userId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      generated_at: new Date().toISOString(),
      summary: {
        total_sessions: totalSessions,
        completed_sessions: completedSessions,
        active_sessions: activeSessions,
        total_measurements: totalMeasurements,
        correct_measurements: correctMeasurements,
        incorrect_measurements: incorrectMeasurements,
        accuracy_percent: accuracyPercent(correctMeasurements, totalMeasurements),
        total_duration_minutes: round(totalMinutes, 1)
      },
      recent_sessions: recentSessions,
      joint_progress: jointProgress,
      daily_trend: dailyTrend
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProgressByUser };
