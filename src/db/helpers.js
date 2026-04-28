// src/db/helpers.js
// sql.js has a different API from better-sqlite3.
// These helpers make it feel similar: queryAll, queryOne, run.

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
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
  // Return the last inserted rowid
  const result = queryOne(db, 'SELECT last_insert_rowid() AS id');
  return { lastInsertRowid: result ? result['last_insert_rowid()'] : null };
}

module.exports = { queryAll, queryOne, run };
