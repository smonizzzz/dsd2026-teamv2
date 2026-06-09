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
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      action_type TEXT    NOT NULL DEFAULT 'unknown',
      started_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      ended_at    TEXT
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
  // instructions and muscle_groups are JSON arrays stored as TEXT.
  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'General',
      description   TEXT NOT NULL DEFAULT '',
      instructions  TEXT,
      gif_url       TEXT,
      thumbnail_url TEXT,
      muscle_groups TEXT,
      equipment     TEXT,
      difficulty    TEXT
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
    "ALTER TABLE sessions ADD COLUMN action_type TEXT NOT NULL DEFAULT 'unknown'",
    "ALTER TABLE measurements ADD COLUMN pain_level INTEGER",
    "ALTER TABLE schedule_exercises ADD COLUMN notes       TEXT",
    "ALTER TABLE schedule_exercises ADD COLUMN gif_url     TEXT",
    "ALTER TABLE schedule_exercises ADD COLUMN description TEXT",
    "ALTER TABLE exercises ADD COLUMN instructions  TEXT",
    "ALTER TABLE exercises ADD COLUMN thumbnail_url TEXT",
    "ALTER TABLE exercises ADD COLUMN muscle_groups TEXT",
    "ALTER TABLE exercises ADD COLUMN equipment     TEXT",
    "ALTER TABLE exercises ADD COLUMN difficulty    TEXT",
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

  // Patient self-reported pain entries (M1 captures locally and syncs; M2 reads for correlation).
  db.run(`
    CREATE TABLE IF NOT EXISTS pain_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level      INTEGER NOT NULL CHECK(level >= 1 AND level <= 10),
      notes      TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
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
  db.run('CREATE INDEX IF NOT EXISTS idx_pain_user_date ON pain_logs(user_id, created_at DESC);');

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
  // Ensure the admin account has the 'admin' role. Older deployments seeded it as
  // 'clinician' (before the admin role existed); upgrade it idempotently on every start.
  run(db, "UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'", [adminEmail]);

  // Seed the global exercise catalogue (only if empty). Full M1 format with
  // instructions/muscle_groups (JSON arrays), real gif_url, equipment, difficulty.
  const exCount = db.exec('SELECT COUNT(*) AS c FROM exercises');
  const isEmpty = !exCount.length || exCount[0].values[0][0] === 0;
  if (isEmpty) {
    const seed = [
      { name: 'Squat', category: 'Lower Body', description: 'Strengthens quadriceps, glutes and core. Essential for regaining functional leg strength after lower limb surgery.', instructions: ['Stand with feet shoulder-width apart, toes pointing slightly outward.', 'Extend your arms forward for balance and keep your chest up.', 'Slowly bend your knees and sit back with your hips, as if sitting into a chair.', 'Lower until your knees are parallel with your glutes, or as far as comfortable.', 'Return to the starting position, pressing through your heels.', 'Keep your knees aligned with your toes throughout — do not let them cave inward.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/493.gif', thumbnail_url: '', muscle_groups: ['Upper Legs', 'Glutes', 'Abs'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Walking Test', category: 'Gait', description: 'Assesses basic gait quality and mobility after lower limb injury or surgery.', instructions: ['Stand upright with eyes forward and arms relaxed at your sides.', 'Walk forward at a natural, comfortable pace for 5 metres.', 'Maintain an even stride, keeping your weight centred.', 'Turn around and return to the starting position.', 'Use a walking aid or hold a wall if needed for safety.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/1373.gif', thumbnail_url: '', muscle_groups: ['Lower Legs', 'Upper Legs', 'Glutes'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Stair Climbing', category: 'Lower Body', description: 'Builds functional strength and confidence in lower limb joints for everyday activities.', instructions: ['Stand facing a staircase and hold the handrail for support.', 'Step up with the stronger or less painful leg first.', 'Bring the other leg up to join it on the same step.', 'Continue climbing one step at a time, maintaining upright posture.', 'To descend, step down with the weaker leg first.', 'Stop if you feel sharp pain or instability.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/1225.gif', thumbnail_url: '', muscle_groups: ['Upper Legs', 'Glutes', 'Lower Legs'], equipment: 'Body Weight', difficulty: 'Intermediate' },
      { name: 'Straight Leg Raise', category: 'Lower Body', description: 'Strengthens the quadriceps without knee flexion. Ideal for early post-surgery rehabilitation when the knee cannot yet bend.', instructions: ['Lie flat on your back on the floor with arms at your sides.', 'Bend one knee with the foot flat on the floor for support.', 'Keep the other leg straight and tighten its thigh muscle.', 'Slowly lift the straight leg to approximately 45°, level with the bent knee.', 'Hold for 2 seconds at the top.', 'Lower slowly back to the floor.', 'Complete all reps on one side before switching legs.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/982.gif', thumbnail_url: '', muscle_groups: ['Upper Legs', 'Abs'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Knee Extension', category: 'Lower Body', description: 'Isolates and strengthens the quadriceps through controlled knee extension. Suitable for both machine and chair-based rehabilitation.', instructions: ['Sit upright on a chair or machine with your back firmly against the support.', 'Let your feet hang naturally at a 90-degree angle.', 'Grip the edges of the seat or handles to stabilise yourself.', 'Slowly extend one or both legs until fully straight.', 'Pause briefly at the top — do not snap or lock the knees.', 'Lower slowly back to the starting position.', 'Use controlled movements throughout; do not swing.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/130.gif', thumbnail_url: '', muscle_groups: ['Upper Legs'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Ankle Pumps', category: 'Lower Body', description: 'Promotes circulation and reduces swelling in the lower limb. Especially important in the first days after surgery.', instructions: ['Sit in a chair or lie on your back with your legs comfortably extended.', 'Slowly flex your foot upward, pulling your toes towards you.', 'Hold for 2–3 seconds.', 'Then slowly point your foot downward away from you.', 'Hold for 2–3 seconds.', 'Repeat in a continuous pumping motion.', 'Perform on both ankles, 10–20 repetitions each.'], gif_url: 'https://www.physio-pedia.com/images/archive/3/35/20200323205608%21Ankle_pumps.gif', thumbnail_url: '', muscle_groups: ['Lower Legs'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Hip Abduction', category: 'Lower Body', description: 'Strengthens the hip abductor muscles. Important for knee and hip stability during recovery.', instructions: ['Lie on your side on the floor or a mat.', 'Prop yourself up on your bottom elbow, directly beneath your shoulder.', 'Keep your body in a straight line from head to feet.', 'Slowly lift your top leg upward as high as you comfortably can without rotating your hips backward.', 'Pause briefly at the top.', 'Lower the leg slowly back to the starting position.', 'Complete all reps on one side before turning over.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/1361.gif', thumbnail_url: '', muscle_groups: ['Upper Legs', 'Glutes'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Calf Raises', category: 'Lower Body', description: 'Strengthens the calf muscles and improves ankle stability. Supports safe return to walking and load-bearing activities.', instructions: ['Stand with the balls of your feet on the edge of a step, heels hanging off.', 'Hold a wall or handrail lightly for balance.', 'Let your heels drop down as far as comfortable to get a full calf stretch.', 'Slowly raise your heels up as high as possible, squeezing your calf muscles.', 'Hold at the top for 1–2 seconds.', 'Lower slowly back to the starting position.', 'If no step is available, perform flat on the floor for a reduced range.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/1227.gif', thumbnail_url: '', muscle_groups: ['Lower Legs'], equipment: 'Body Weight', difficulty: 'Beginner' },
      { name: 'Hamstring Stretch', category: 'Flexibility', description: 'Stretches the hamstring muscles to restore range of motion and prevent tightness after lower limb injury.', instructions: ['Sit on the floor with both legs extended straight out in front of you.', 'Place a belt, towel or resistance band around one foot and hold both ends.', 'Keep your back straight — do not round your spine.', 'Gently pull back on the belt to draw your toes towards you.', 'Lean slightly forward from the hips until you feel a stretch along the back of your thigh.', 'Hold the stretch for 15–30 seconds.', 'Release slowly and repeat on the other leg.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/932.gif', thumbnail_url: '', muscle_groups: ['Upper Legs', 'Lower Legs'], equipment: 'Body Weight', difficulty: 'Intermediate' },
      { name: 'Single-Leg Balance', category: 'Balance', description: 'Trains proprioception and joint stability. A key functional milestone in lower limb rehabilitation.', instructions: ['Stand upright with both arms relaxed at your sides.', 'Focus on a fixed point in front of you to help maintain balance.', 'Slowly lift one foot off the floor, keeping the standing knee slightly soft.', 'Hold the balance on one leg for up to 30 seconds.', 'Stand next to a wall or sturdy surface as a safety measure if needed.', 'Lower the foot and rest briefly, then switch sides.', 'As you progress, try closing your eyes briefly to increase the difficulty.'], gif_url: 'https://cdn.jefit.com/assets/img/exercises/gifs/662.gif', thumbnail_url: '', muscle_groups: ['Abs', 'Glutes', 'Upper Legs'], equipment: 'Body Weight', difficulty: 'Advanced' },
    ];
    // Thumbnails hosted by M1 on GitHub (raw, public). Indexed to match the seed order above.
    const THUMB_BASE = 'https://raw.githubusercontent.com/diogopinhel/limbmotionrecovery-assets/main/';
    const thumbs = [
      'thumb_squat.png', 'thumb_walking_test.png', 'thumb_stair_climbing.png',
      'thumb_straight_leg_raise.png', 'thumb_knee_extension.png', 'thumb_ankle_pumps.png',
      'thumb_hip_abduction.png', 'thumb_calf_raises.png', 'thumb_hamstring_stretch.png',
      'thumb_single_leg_balance.png',
    ];
    seed.forEach((ex, i) => {
      run(db, `INSERT INTO exercises (name, category, description, instructions, gif_url, thumbnail_url, muscle_groups, equipment, difficulty)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ex.name, ex.category, ex.description, JSON.stringify(ex.instructions), ex.gif_url, THUMB_BASE + thumbs[i], JSON.stringify(ex.muscle_groups), ex.equipment, ex.difficulty]);
    });
    console.log(`  Exercise catalogue seeded: ${seed.length} exercises`);
  }

  save();
  console.log('  Database ready: data/v2.db');
}

module.exports = initDb;
