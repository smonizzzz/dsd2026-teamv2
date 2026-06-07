const getDb = require('../db/connection');
const { queryAll } = require('../db/helpers');

// GET /exercises — global exercise catalogue used by M2 to build patient plans.
// Open endpoint (no auth). gif_url is always present (null when no GIF on file).
async function getExercises(req, res, next) {
  try {
    const { db } = await getDb();
    const rows = queryAll(db, 'SELECT id, name, category, description, gif_url FROM exercises ORDER BY id ASC')
      .map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        gif_url: r.gif_url ?? null
      }));
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getExercises };
