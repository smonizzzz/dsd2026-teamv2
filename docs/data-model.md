# Data Model — V2 Backend

**Version 2.0 · Sprint 3 · DSD 2025–2026 · UTAD × Jilin University**

This document describes the actual SQLite schema created by `src/db/init.js`. Column
names are the real (snake_case) database columns. All `*_at` columns are ISO 8601 UTC
strings normalised on every read.

## Revision History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | Apr 2026 | Initial 4-entity model (User, Session, Measurement, Recommendation) |
| 2.0 | Jun 2026 | Full schema: doctor binding, schedule exercises, feedback, announcements, audit log, push tokens; sensor_data; profile fields |

---

## Entities

### users
Patients, clinicians and the seeded admin all live in this table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | autoincrement |
| `name` | TEXT | not null |
| `email` | TEXT | not null, unique |
| `role` | TEXT | `patient` \| `clinician` \| `admin` (default `patient`) |
| `password` | TEXT | bcrypt hash (cost ≥ 10); never returned by the API |
| `status` | TEXT | `active` \| `pending` \| `rejected` \| `disabled` (default `active`) |
| `age` | INTEGER | nullable |
| `license_path` | TEXT | nullable; clinician license file path (never returned) |
| `doctor_id` | INTEGER FK→users(id) | the clinician a patient is bound to; `0`/null = unbound |
| `condition_label` | TEXT | nullable; e.g. "Right Knee Surgery" |
| `condition_date` | TEXT | nullable; date of the condition/surgery |
| `created_at` | TEXT | ISO 8601 |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK→users(id) | the patient |
| `started_at` | TEXT | ISO 8601 |
| `ended_at` | TEXT | nullable; set when the session closes |

### measurements
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `session_id` | INTEGER FK→sessions(id) | |
| `timestamp` | TEXT | ISO 8601 |
| `joint_angles` | TEXT (JSON) | object map `{"knee":45.2}` **or** M1/S2 array `[{angleID,angle,timestamp}]` |
| `sensor_data` | TEXT (JSON) | nullable; raw IMU frames (acc/gyro/orientation) |
| `is_correct` | INTEGER (bool) | default 0; set by V1 after AI classification *(write-back mechanism still open)* |

### recommendations
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `session_id` | INTEGER FK→sessions(id) | |
| `movement` | TEXT | not null |
| `status` | TEXT | `pending` \| `accepted` \| `rejected` (default `pending`) |
| `confidence` | REAL | 0.0–1.0 |
| `notes` | TEXT | nullable |
| `created_at` | TEXT | ISO 8601 |

### schedules
A plan item (one exercise appointment) assigned to a patient.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK→users(id) | the patient |
| `exercise` | TEXT | not null |
| `date` | TEXT | ISO 8601 |
| `duration` | INTEGER | minutes (default 30) |
| `notes` | TEXT | nullable (API returns `""` when null) |
| `video_url` | TEXT | nullable; demo video URL |
| `status` | TEXT | `pending` \| `completed` \| `skipped` (default `pending`) |
| `created_at` | TEXT | ISO 8601 |

### schedule_exercises
Individual exercises inside a schedule item (Plan Details screen).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `schedule_id` | INTEGER FK→schedules(id) | |
| `name` | TEXT | not null |
| `phase` | TEXT | `Warm Up` \| `Strength` \| `Mobility` \| `Cooldown` (default `Strength`) |
| `sets` | INTEGER | default 1 |
| `reps` | INTEGER | default 1 |
| `hold_seconds` | INTEGER | default 0 |
| `completed` | INTEGER (bool) | default 0 |
| `last_pain_level` | INTEGER | nullable; 1–10 |
| `completed_at` | TEXT | nullable; ISO 8601 |
| `created_at` | TEXT | ISO 8601 |

### push_tokens
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK→users(id) | |
| `token` | TEXT | device push token |
| `platform` | TEXT | nullable; `android` \| `ios` \| `harmony` |
| `created_at` | TEXT | ISO 8601 |
| | | UNIQUE(`user_id`, `token`) |

### feedback
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK→users(id) | |
| `content` | TEXT | not null |
| `status` | TEXT | `pending` \| `reviewed` \| `resolved` (default `pending`) |
| `response` | TEXT | nullable; admin reply |
| `created_at` / `updated_at` | TEXT | ISO 8601 |

### announcements
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `title` / `content` | TEXT | not null |
| `status` | TEXT | `draft` \| `published` (default `draft`) |
| `created_by` | INTEGER FK→users(id) | |
| `created_at` / `updated_at` | TEXT | ISO 8601 |

### audit_logs
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK→users(id) | nullable; the actor |
| `action` | TEXT | e.g. `UPDATE_USER`, `APPROVE_USER`, `DELETE_ANNOUNCEMENT` |
| `target_type` / `target_id` | TEXT / INTEGER | the affected entity |
| `details` | TEXT (JSON) | nullable |
| `created_at` | TEXT | ISO 8601 |

---

## Relationships

```
users (clinician) 1 ──< users (patient)        via patient.doctor_id
users (patient)   1 ──< sessions ──< measurements
sessions          1 ──< recommendations
users (patient)   1 ──< schedules ──< schedule_exercises
users             1 ──< push_tokens
users             1 ──< feedback
users (admin)     1 ──< announcements (created_by)
users             1 ──< audit_logs
```

## Indexes

`idx_sessions_user`, `idx_meas_session`, `idx_recs_session`, `idx_schedule_user`,
`idx_push_user`, `idx_feedback_user`, `idx_audit_user`, `idx_users_doctor`,
`idx_sched_ex_sched`.

## Open data-model issues

- **`is_correct` write-back (V1):** the column exists and defaults to `0`, but V1 has not
  defined how classification results are written back to measurements. Currently always `false`.
- **Conflict 4 (raw IMU schema):** `sensor_data` stores raw frames as free JSON; the formal
  schema is still pending a joint S2 + V1 + V2 decision.
