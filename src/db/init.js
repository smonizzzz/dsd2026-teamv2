const getDb = require('./connection');

async function initDb() {
  const { db, save } = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      email        TEXT    NOT NULL UNIQUE,
      role         TEXT    NOT NULL DEFAULT 'patient',
      password     TEXT,
      status       TEXT    NOT NULL DEFAULT 'active',
      age          INTEGER,
      license_path TEXT,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      started_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      ended_at   TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS measurements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(id),
      timestamp    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
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
      notes       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      exercise   TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      duration   INTEGER NOT NULL DEFAULT 30,
      notes      TEXT,
      status     TEXT    NOT NULL DEFAULT 'pending',
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      token      TEXT    NOT NULL,
      platform   TEXT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(user_id, token)
    );
  `);

  // Migrate existing databases: add columns introduced after initial release.
  // ALTER TABLE ignores errors if the column already exists.
  const migrations = [
    "ALTER TABLE users ADD COLUMN status       TEXT    NOT NULL DEFAULT 'active'",
    "ALTER TABLE users ADD COLUMN age          INTEGER",
    "ALTER TABLE users ADD COLUMN license_path TEXT",
    "ALTER TABLE recommendations ADD COLUMN notes TEXT",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch { /* column already exists */ }
  }

  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_meas_session   ON measurements(session_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_recs_session   ON recommendations(session_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_schedule_user  ON schedules(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_push_user      ON push_tokens(user_id);');

  save();
  console.log('  Database ready: data/v2.db');
}

module.exports = initDb;
