const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

async function getRecommendationsBySession(req, res, next) {
  try {
    const { db } = await getDb();
    const session = queryOne(db, 'SELECT id FROM sessions WHERE id = ?', [req.params.sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }
    res.json(queryAll(db,
      'SELECT * FROM recommendations WHERE session_id = ? ORDER BY confidence DESC',
      [req.params.sessionId]
    ));
  } catch (err) { next(err); }
}

async function createRecommendation(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { sessionId, movement, confidence = 0.0, status = 'pending', notes = null } = req.body;

    if (!sessionId || !movement) {
      const e = new Error('sessionId and movement are required'); e.status = 400; return next(e);
    }
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      const e = new Error('status must be pending, accepted or rejected'); e.status = 400; return next(e);
    }

    const session = queryOne(db, 'SELECT id FROM sessions WHERE id = ?', [sessionId]);
    if (!session) { const e = new Error('Session not found'); e.status = 404; return next(e); }

    const result = run(db,
      'INSERT INTO recommendations (session_id, movement, status, confidence, notes) VALUES (?, ?, ?, ?, ?)',
      [sessionId, movement, status, confidence, notes]
    );
    save();
    res.status(201).json(queryOne(db, 'SELECT * FROM recommendations WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { next(err); }
}

async function updateRecommendationStatus(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      const e = new Error('status must be pending, accepted or rejected'); e.status = 400; return next(e);
    }
    const rec = queryOne(db, 'SELECT * FROM recommendations WHERE id = ?', [req.params.id]);
    if (!rec) { const e = new Error('Recommendation not found'); e.status = 404; return next(e); }

    run(db, 'UPDATE recommendations SET status = ? WHERE id = ?', [status, req.params.id]);
    save();
    res.json(queryOne(db, 'SELECT * FROM recommendations WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
}

async function generateRecommendations(req, res, next) {
  try {
    const { db } = await getDb();
    const user = queryOne(db, 'SELECT id FROM users WHERE id = ?', [req.params.userId]);
    if (!user) { const e = new Error('User not found'); e.status = 404; return next(e); }

    const sessions = queryAll(db,
      'SELECT id FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 10',
      [req.params.userId]
    );
    if (sessions.length === 0) {
      return res.json({ userId: Number(req.params.userId), sessions_analysed: 0, suggestions: [] });
    }

    const ids = sessions.map(s => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const measurements = queryAll(db,
      `SELECT joint_angles, is_correct FROM measurements WHERE session_id IN (${placeholders})`,
      ids
    );

    const stats = {};
    for (const m of measurements) {
      let angles;
      try { angles = JSON.parse(m.joint_angles); } catch { continue; }
      for (const joint of Object.keys(angles)) {
        if (!stats[joint]) stats[joint] = { total: 0, correct: 0 };
        stats[joint].total++;
        if (m.is_correct) stats[joint].correct++;
      }
    }

    const suggestions = Object.entries(stats).map(([joint, s]) => {
      const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      return {
        joint,
        accuracy_percent: pct,
        total_measurements: s.total,
        priority: pct < 50 ? 'high' : pct < 70 ? 'medium' : 'low',
        suggestion: pct < 70 ? `Needs improvement (${pct}% correct)` : `Good performance (${pct}% correct)`
      };
    }).sort((a, b) => a.accuracy_percent - b.accuracy_percent);

    res.json({
      userId: Number(req.params.userId),
      sessions_analysed: sessions.length,
      generated_at: new Date().toISOString(),
      suggestions
    });
  } catch (err) { next(err); }
}

module.exports = { getRecommendationsBySession, createRecommendation, updateRecommendationStatus, generateRecommendations };
