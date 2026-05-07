const bcrypt = require('bcryptjs');
const getDb  = require('./connection');
const { queryOne, run } = require('./helpers');

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

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      content    TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'pending',
      response   TEXT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'draft',
      created_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at   TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   INTEGER,
      details     TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_meas_session   ON measurements(session_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_recs_session   ON recommendations(session_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_schedule_user  ON schedules(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_push_user      ON push_tokens(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_feedback_user  ON feedback(user_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_logs(user_id);');

  // Seed default admin account if it does not exist yet.
  const adminEmail = process.env.ADMIN_EMAIL    || 'admin@v2.dsd';
  const adminPass  = process.env.ADMIN_PASSWORD || 'Admin2026!';
  if (!queryOne(db, 'SELECT id FROM users WHERE email = ?', [adminEmail])) {
    const hash = bcrypt.hashSync(adminPass, 10);
    run(db,
      "INSERT INTO users (name, email, role, password, status) VALUES (?, ?, 'admin', ?, 'active')",
      ['V2 Admin', adminEmail, hash]
    );
    console.log(`  Admin seeded: ${adminEmail}`);
  }

  save();
  console.log('  Database ready: data/v2.db');
}

module.exports = initDb;
