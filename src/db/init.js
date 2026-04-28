// src/db/init.js
// Creates all tables. Called automatically on server start.

const getDb = require('./connection');

async function initDb() {
  const { db, save } = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      role       TEXT    NOT NULL DEFAULT 'patient',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      started_at TEXT    NOT NULL DEFAULT (datetime('now')),
      ended_at   TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS measurements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(id),
      timestamp    TEXT    NOT NULL DEFAULT (datetime('now')),
      joint_angles TEXT    NOT NULL,
      is_correct   INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES sessions(id),
      movement    TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'pending',
      confidence  REAL    NOT NULL DEFAULT 0.0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_meas_session  ON measurements(session_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_recs_session  ON recommendations(session_id);');

  save();
  console.log('  Database ready: data/v2.db');
}

module.exports = initDb;
