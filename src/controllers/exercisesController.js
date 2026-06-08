const getDb = require('../db/connection');
const { queryAll } = require('../db/helpers');

// instructions and muscle_groups are stored as JSON arrays; parse them, defaulting to [].
function parseArray(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

// GET /exercises — global exercise catalogue used by M2 to build patient plans.
// Open endpoint (no auth). Arrays are always [] (never null); url fields always present.
async function getExercises(req, res, next) {
  try {
    const { db } = await getDb();
    const rows = queryAll(db, 'SELECT * FROM exercises ORDER BY id ASC')
      .map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        instructions: parseArray(r.instructions),
        gif_url: r.gif_url ?? null,
        thumbnail_url: r.thumbnail_url ?? '',
        muscle_groups: parseArray(r.muscle_groups),
        equipment: r.equipment ?? null,
        difficulty: r.difficulty ?? null
      }));
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getExercises };
