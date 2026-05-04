// src/db/helpers.js
// sql.js has a different API from better-sqlite3.
// These helpers make it feel similar: queryAll, queryOne, run.

// SQLite datetime('now') stores "2026-05-02 13:43:28" (no T, no Z).
// Normalize any *_at field to ISO 8601 so all date fields are consistent.
function normalizeDate(str) {
  if (!str || typeof str !== 'string' || str.includes('T')) return str;
  return new Date(str.replace(' ', 'T') + 'Z').toISOString();
}

function normalizeDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = k.endsWith('_at') ? normalizeDate(v) : v;
  }
  return out;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(normalizeDates(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(db, sql, params = []) {
  db.run(sql, params);
  const result = queryOne(db, 'SELECT last_insert_rowid() AS id');
  return { lastInsertRowid: result ? result.id : null };
}

module.exports = { queryAll, queryOne, run };
