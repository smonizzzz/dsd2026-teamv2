const bcrypt = require('bcryptjs');
const getDb  = require('./connection');
const { queryOne, run } = require('./helpers');

async function initDb() {
  const { db, save } = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      email           TEXT    NOT NULL UNIQUE,
      role            TEXT    NOT NULL DEFAULT 'patient',
      password        TEXT,
      status          TEXT    NOT NULL DEFAULT 'active',
      age             INTEGER,
      license_path    TEXT,
      doctor_id       INTEGER REFERENCES users(id),
      condition_label TEXT,
      condition_date  TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
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
      video_url  TEXT,
      status     TEXT    NOT NULL DEFAULT 'pending',
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_exercises (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id     INTEGER NOT NULL REFERENCES schedules(id),
      name            TEXT    NOT NULL,
      phase           TEXT    NOT NULL DEFAULT 'Strength',
      sets            INTEGER NOT NULL DEFAULT 1,
      reps            INTEGER NOT NULL DEFAULT 1,
      hold_seconds    INTEGER NOT NULL DEFAULT 0,
      notes           TEXT,
      gif_url         TEXT,
      description     TEXT,
      completed       INTEGER NOT NULL DEFAULT 0,
      last_pain_level INTEGER,
      completed_at    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  // Global exercise catalogue (read by M2 to build patient plans).
  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'General',
      description TEXT NOT NULL DEFAULT '',
      gif_url     TEXT
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
    "ALTER TABLE users ADD COLUMN status          TEXT    NOT NULL DEFAULT 'active'",
    "ALTER TABLE users ADD COLUMN age             INTEGER",
    "ALTER TABLE users ADD COLUMN license_path    TEXT",
    "ALTER TABLE users ADD COLUMN doctor_id       INTEGER REFERENCES users(id)",
    "ALTER TABLE users ADD COLUMN condition_label TEXT",
    "ALTER TABLE users ADD COLUMN condition_date  TEXT",
    "ALTER TABLE recommendations ADD COLUMN notes TEXT",
    "ALTER TABLE measurements ADD COLUMN sensor_data TEXT",
    "ALTER TABLE schedule_exercises ADD COLUMN notes       TEXT",
    "ALTER TABLE schedule_exercises ADD COLUMN gif_url     TEXT",
    "ALTER TABLE schedule_exercises ADD COLUMN description TEXT",
    "ALTER TABLE schedules ADD COLUMN video_url TEXT",
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
  db.run('CREATE INDEX IF NOT EXISTS idx_users_doctor   ON users(doctor_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_sched_ex_sched ON schedule_exercises(schedule_id);');

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

  // Seed the global exercise catalogue (only if empty). gif_url is left NULL —
  // real GIF URLs are to be supplied later by the clinical team via M2.
  const exCount = db.exec('SELECT COUNT(*) AS c FROM exercises');
  const isEmpty = !exCount.length || exCount[0].values[0][0] === 0;
  if (isEmpty) {
    const seed = [
      ['Squat', 'Lower Body', '3 reps, ~5 s each. Feet shoulder-width apart, knees aligned with toes. Do not let knees cave inward.'],
      ['Walking Test', 'Gait', 'Walk forward 5 m at a natural pace. Eyes forward, arms relaxed.'],
      ['Stair Climbing', 'Lower Body', 'Climb 10 steps. Body upright, one step at a time, hold the rail if needed.'],
      ['Straight Leg Raise', 'Lower Body', 'Lie flat on back. Lift one leg to 45 degrees, hold 2 s, lower slowly.'],
      ['Knee Extension', 'Lower Body', 'Seated on a chair. Extend knee fully, hold 3 s, lower slowly.'],
      ['Ankle Pumps', 'Lower Body', 'Seated or lying. Flex and point the ankle repeatedly. Good for circulation post-surgery.'],
      ['Hip Abduction', 'Lower Body', 'Side-lying. Lift top leg to 30-45 degrees, hold 2 s, lower slowly.'],
      ['Calf Raises', 'Lower Body', 'Stand with feet flat. Rise onto toes, hold 2 s, lower slowly.'],
      ['Hamstring Stretch', 'Flexibility', 'Seated, legs extended. Reach forward towards feet, hold 20-30 s. Do not bounce.'],
      ['Single-Leg Balance', 'Balance', 'Stand on one leg for 30 s. Switch sides. Hold a wall if needed.'],
    ];
    for (const [name, category, description] of seed) {
      run(db, 'INSERT INTO exercises (name, category, description, gif_url) VALUES (?, ?, ?, NULL)', [name, category, description]);
    }
    console.log(`  Exercise catalogue seeded: ${seed.length} exercises`);
  }

  save();
  console.log('  Database ready: data/v2.db');
}

module.exports = initDb;
