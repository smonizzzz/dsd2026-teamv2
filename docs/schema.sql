-- ============================================================================
-- V2 Backend — Database Schema (SQLite)
-- DSD 2025-2026 · UTAD x Jilin University · Team V2
-- Mirrors src/db/init.js. All *_at columns are ISO 8601 UTC strings.
-- ============================================================================

-- Users: patients, clinicians and the seeded admin.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  role            TEXT    NOT NULL DEFAULT 'patient',   -- patient | clinician | admin
  password        TEXT,                                 -- bcrypt hash (never returned by the API)
  status          TEXT    NOT NULL DEFAULT 'active',    -- active | pending | rejected | disabled
  age             INTEGER,
  license_path    TEXT,                                 -- clinician license file (never returned)
  doctor_id       INTEGER REFERENCES users(id),         -- patient's bound clinician (0/null = unbound)
  condition_label TEXT,
  condition_date  TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Rehabilitation sessions.
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ended_at   TEXT
);

-- Measurements (joint-angle readings + optional raw IMU data).
CREATE TABLE IF NOT EXISTS measurements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  timestamp    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  joint_angles TEXT    NOT NULL,                        -- JSON: object map or targetAngles array
  sensor_data  TEXT,                                    -- JSON: raw IMU frames (nullable)
  is_correct   INTEGER NOT NULL DEFAULT 0               -- bool; set by V1 after classification
);

-- AI / clinician recommendations.
CREATE TABLE IF NOT EXISTS recommendations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions(id),
  movement    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',       -- pending | accepted | rejected
  confidence  REAL    NOT NULL DEFAULT 0.0,
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Rehabilitation plan items (one exercise appointment).
CREATE TABLE IF NOT EXISTS schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  exercise   TEXT    NOT NULL,
  date       TEXT    NOT NULL,
  duration   INTEGER NOT NULL DEFAULT 30,               -- minutes
  notes      TEXT,
  video_url  TEXT,
  status     TEXT    NOT NULL DEFAULT 'pending',        -- pending | completed | skipped
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Individual exercises inside a plan item.
CREATE TABLE IF NOT EXISTS schedule_exercises (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id     INTEGER NOT NULL REFERENCES schedules(id),
  name            TEXT    NOT NULL,
  phase           TEXT    NOT NULL DEFAULT 'Strength',  -- Warm Up | Strength | Mobility | Cooldown
  sets            INTEGER NOT NULL DEFAULT 1,
  reps            INTEGER NOT NULL DEFAULT 1,
  hold_seconds    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  gif_url         TEXT,
  description     TEXT,
  completed       INTEGER NOT NULL DEFAULT 0,           -- bool
  last_pain_level INTEGER,                              -- 1-10 (nullable)
  completed_at    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Global exercise catalogue (seeded with 10 entries; gif_url null until supplied).
CREATE TABLE IF NOT EXISTS exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  gif_url     TEXT
);

-- Device push-notification tokens.
CREATE TABLE IF NOT EXISTS push_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token      TEXT    NOT NULL,
  platform   TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(user_id, token)
);

-- User feedback.
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  content    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending',        -- pending | reviewed | resolved
  response   TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT
);

-- Platform announcements.
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',             -- draft | published
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT
);

-- Administrator action audit log.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  details     TEXT,                                     -- JSON
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_meas_session   ON measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_recs_session   ON recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_schedule_user  ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user      ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user  ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_users_doctor   ON users(doctor_id);
CREATE INDEX IF NOT EXISTS idx_sched_ex_sched ON schedule_exercises(schedule_id);
