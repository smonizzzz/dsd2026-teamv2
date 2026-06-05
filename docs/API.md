# V2 Backend — API Reference

Single source of truth for every endpoint the V2 backend exposes. Built for the M1
mobile app, but usable by every team (S2, V1, M2). Endpoints added in the latest
round for M1 are tagged **🆕 NEW**.

---

## Base URLs

| Environment | URL | Transport |
|-------------|-----|-----------|
| Railway (production) | `https://dsd2026-teamv2-production.up.railway.app` | HTTPS |
| Huawei Cloud | `http://113.44.220.94:3000` | HTTP |

WebSocket (real-time feedback): `wss://dsd2026-teamv2-production.up.railway.app/ws?sessionId=<id>`

---

## Conventions

| Rule | Detail |
|------|--------|
| Auth | Protected routes need header `Authorization: Bearer <jwt>`. Token comes from `/auth/login` or `/auth/register`. Valid 7 days. |
| Request casing | Send **camelCase** in JSON bodies (`sessionId`, `doctorId`, `targetAngles`). |
| Response casing | User/session/measurement objects use **snake_case** (`doctor_id`, `user_id`, `created_at`). Newer nested objects (progress, exercises) use **camelCase**. Each endpoint below shows the exact shape. |
| Dates | Date-only fields: `YYYY-MM-DD`. Timestamps: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. |
| IDs | Always integers. `doctor_id: 0` means "patient not yet bound to a doctor". |
| Arrays | Empty arrays are returned as `[]`, never `null`. |
| Errors | Always `{ "error": "message" }` with the proper HTTP status. |

---

## Endpoint Index

| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/health` | – | Liveness check |
| POST | `/auth/register` | – | Register patient (open) or clinician (pending approval) |
| POST | `/auth/login` | – | Log in, get JWT |
| GET | `/auth/me` | ✓ | Current user profile |
| GET | `/auth/status` | ✓ | Current user role + approval status |
| PATCH | `/auth/approve/:userId` | ✓ | Admin: approve a pending clinician |
| PATCH | `/auth/reject/:userId` | ✓ | Admin: reject a pending clinician |
| GET | `/users` | – | List users (`?role=patient\|clinician`) |
| GET | `/users/:id` | – | Get one user (doctor verification) |
| POST | `/users` | – | Create a user (no password) |
| PATCH | `/users/:id` | – | Update user — **incl. doctor binding** |
| GET | `/users/:id/license` | – | Download a clinician's license file |
| PATCH | `/users/:id/license` | – | Replace a clinician's license file |
| GET | `/patients` | – | List all patients |
| GET | `/patients/:id` | – | Get one patient |
| POST | `/sessions` | – | Start an exercise session |
| GET | `/sessions` | – | List sessions (`?userId=`) |
| GET | `/sessions/:id` | – | Session detail + measurements |
| PATCH | `/sessions/:id/end` | – | End a session |
| DELETE | `/sessions/:id` | – | Delete a session (cascade) |
| POST | `/measurements` | – | Upload one measurement |
| POST | `/measurements/batch` | – | Upload many measurements |
| POST | `/measurements/raw` | – | Upload raw IMU frame (S2 format) |
| GET | `/measurements/:sessionId` | – | List measurements for a session |
| GET | `/recommendations/engine/:userId` | – | AI accuracy analysis |
| GET | `/recommendations/session/:sessionId` | – | Recommendations for a session |
| POST | `/recommendations` | – | Create a recommendation |
| PATCH | `/recommendations/:id` | – | Update recommendation status |
| GET | `/schedule/:userId` | – | Patient's plan list |
| POST | `/schedule` | – | Create a plan item |
| PATCH | `/schedule/:id` | – | Update / complete a plan item |
| DELETE | `/schedule/:id` | – | Delete a plan item |
| GET | `/schedule/:id/exercises` | – | 🆕 Plan detail + exercise list |
| POST | `/schedule/:id/exercises` | – | 🆕 Add an exercise to a plan |
| PATCH | `/schedule/:id/exercises/:exerciseId/complete` | – | 🆕 Mark one exercise done |
| GET | `/progress/:userId` | – | 🆕 Patient progress (ROM / adherence / pain) |
| POST | `/push/register` | – | Register an FCM device token |
| GET | `/push/tokens/:userId` | – | List a user's push tokens |
| GET | `/feedback` · `/feedback/:id` | – | User feedback (admin) |
| POST · PATCH | `/feedback` · `/feedback/:id` | – | Submit / respond to feedback |
| GET · POST · PATCH · DELETE | `/announcements` | – | Announcements (admin) |
| GET | `/audit-logs` | – | Admin action log |

> Note: most routes are currently open (no auth) except the four `/auth` ones marked ✓.
> Route-level RBAC is a separate planned task.

---

## 1. Auth

### POST `/auth/register`
Open patient self-registration (no invite token needed). Clinicians register via
`multipart/form-data` with a `license` file and land in `pending` until an admin approves.

**Patient request (JSON):**
```json
{ "name": "Ana Costa", "email": "ana@utad.pt", "password": "123456", "role": "patient" }
```
**Patient response `201`:**
```json
{
  "token": "jwt...",
  "user": { "id": 1, "name": "Ana Costa", "email": "ana@utad.pt",
            "role": "patient", "doctor_id": 0, "status": "active",
            "age": null, "created_at": "2026-04-21T14:00:00Z" }
}
```
`doctor_id` is `0` until the patient is bound (see `PATCH /users/:id`).

**Clinician response `201`:** `{ "userId": 3, "status": "pending" }` (no token yet).

**Errors:** `400` missing fields · `409` email already exists.

### POST `/auth/login`
```json
{ "email": "ana@utad.pt", "password": "123456" }
```
**`200`:** `{ "token": "jwt...", "user": { ...same shape as register, doctor_id real or 0 } }`
**Errors:** `401` invalid credentials · `403` pending or rejected.

### GET `/auth/me`  *(auth)*
```json
{
  "id": 1, "name": "Ana Costa", "email": "ana@utad.pt", "role": "patient",
  "status": "active", "age": 25, "doctor_id": 5,
  "condition_label": "Right Knee Surgery", "condition_date": "2024-03-28",
  "created_at": "2026-05-02T13:43:28Z",
  "conditionLabel": "Right Knee Surgery", "conditionDate": "2024-03-28",
  "currentRomDegrees": null, "adherencePercent": null, "streakWeeks": null
}
```
`conditionLabel`/`conditionDate` mirror the stored columns. The ROM/adherence/streak
stats are served in full by `GET /progress/:userId` and are `null` here.

### GET `/auth/status`  *(auth)*
`{ "userId": 1, "role": "patient", "status": "active" }`

### PATCH `/auth/approve/:userId` · PATCH `/auth/reject/:userId`  *(auth)*
Admin moves a `pending` clinician to `active` / `rejected`.
**`200`:** `{ "userId": 3, "role": "clinician", "status": "active" }`
**Errors:** `404` not found · `409` user not pending.

---

## 2. Users & Doctor Binding

### GET `/users/:id`
Look up any user — used to verify a `doctorId` is a real clinician before binding.
```json
{ "id": 5, "name": "Dr. Ana Rodrigues", "email": "ana.r@hospital.pt",
  "role": "clinician", "age": null, "status": "active",
  "doctor_id": 0, "session_count": 0, "created_at": "..." }
```
**Errors:** `404` not found.

### PATCH `/users/:id`  — **doctor binding**
Update a user. Send only the fields you want changed. M1 sends `doctorId` to bind a
patient to a doctor (after registration, or when changing doctor in Settings).
```json
{ "doctorId": 5 }
```
Other accepted fields: `name`, `age`, `role`, `status`, `conditionLabel`, `conditionDate`.

**`200`:**
```json
{ "id": 1, "name": "Ana Costa", "email": "ana@utad.pt", "role": "patient",
  "age": 25, "status": "active", "doctor_id": 5, "created_at": "..." }
```
**Errors for binding:** `400` doctorId not a positive integer · `403` target user is not a
clinician · `404` patient or doctor not found · `409` patient already bound to that doctor.

### GET `/users` · POST `/users`
- `GET /users?role=clinician` → array of users (filterable by role). Each item now includes `doctor_id`.
- `POST /users` → create a record without a password (admin/manual). Body: `{ name, email, role, age, doctorId? }`.

### GET `/users/:id/license` · PATCH `/users/:id/license`
- `GET` downloads the clinician's stored license file (`404` if none).
- `PATCH` (multipart, field `license`) replaces it and resets the account to `pending`.
  Only allowed while status is `pending` or `rejected`.

---

## 3. Patients

### GET `/patients` · GET `/patients/:id`
List patients / get one patient. Same object shape as `/users` (role fixed to `patient`,
includes `session_count` and `doctor_id`). `404` if the patient id does not exist.

---

## 4. Sessions

### POST `/sessions`
`{ "userId": 1 }` →
```json
{ "id": 1, "user_id": 1, "user_name": "Ana Costa",
  "started_at": "2026-04-21T14:00:00Z", "ended_at": null }
```

### PATCH `/sessions/:id/end`
Empty body → same object with `ended_at` set and `user_name` included.
**Errors:** `404` not found · `409` already closed.

### GET `/sessions/:id`
Session detail with nested measurements. Each measurement:
```json
{
  "id": 1, "session_id": 1, "timestamp": "2026-04-21T14:01:00Z",
  "target_angles": [ { "timestamp": "...", "angleID": "knee", "angle": 45.2 } ],
  "joint_angles":  [ { "timestamp": "...", "angleID": "knee", "angle": 45.2 } ],
  "errors": [],
  "sensor_data": [],
  "is_correct": true
}
```
`target_angles` and `joint_angles` carry the same payload (the data the client uploaded).
`errors` and `sensor_data` are always arrays.

### GET `/sessions?userId=` · DELETE `/sessions/:id`
List sessions (optional `userId` filter, includes `measurement_count`). Delete cascades to
measurements and recommendations.

---

## 5. Measurements

All three upload endpoints accept **either** `jointAngles` (object map, S2/legacy) **or**
`targetAngles` (array, M1) plus optional `sensorData` and `errors`.

### POST `/measurements`
```json
{
  "sessionId": 1,
  "targetAngles": [ { "timestamp": "2026-05-02T13:43:38.549Z", "angleID": "knee", "angle": 45.2 } ],
  "sensorData": [ { "timestamp": "...", "sensorId": "...", "accX": 0.22, "gyroX": 0.0, "roll": 15.5 } ],
  "errors": []
}
```
**`201`:** stored measurement (same shape as in `GET /sessions/:id`).
**Errors:** `404` session not found · `409` session closed.

### POST `/measurements/batch`
```json
{ "sessionId": 1, "measurements": [ { "targetAngles": [...], "sensorData": [] }, { "jointAngles": { "knee": 38 } } ] }
```
**`201`:** `{ "inserted": 2, "sessionId": 1 }`

### POST `/measurements/raw`
S2 raw IMU format. Body: `{ sessionId, targetAngles, sensorData, errors }`. Same response shape.

### GET `/measurements/:sessionId`
Array of measurements (supports `?startDate=&endDate=`), same per-item shape as above.

---

## 6. Recommendations

| Endpoint | Purpose |
|----------|---------|
| `GET /recommendations/engine/:userId` | Analyses recent sessions, returns per-joint accuracy + suggestions |
| `GET /recommendations/session/:sessionId` | Recommendations attached to a session |
| `POST /recommendations` | Create one (`{ sessionId, movement, confidence, notes }`) |
| `PATCH /recommendations/:id` | Update `status` (`pending`/`accepted`/`rejected`) |

**Engine `200`:**
```json
{ "userId": 1, "sessions_analysed": 5, "generated_at": "...",
  "suggestions": [ { "joint": "knee", "accuracy_percent": 42, "total_measurements": 50,
                     "priority": "high", "suggestion": "Needs improvement (42% correct)" } ] }
```

---

## 7. Schedule (Plans)

### GET `/schedule/:userId`
Array of plan items, ordered by `date` ascending. `notes` is always a string, `video_url`
and `doctor_name` are always present (may be `null`).
```json
[
  { "id": 1, "user_id": 1, "exercise": "squat", "date": "2026-05-03T21:43:43Z",
    "duration": 30, "notes": "Keep back straight", "video_url": "https://.../squat.mp4",
    "status": "pending", "doctor_name": "Dr. Ana Rodrigues", "created_at": "..." }
]
```
`status` ∈ `pending` · `completed` · `skipped`.

### POST `/schedule` · PATCH `/schedule/:id` · DELETE `/schedule/:id`
- `POST` body: `{ userId, exercise, date, duration?, notes?, videoUrl?, status? }`.
- `PATCH` updates any of `exercise/date/duration/notes/videoUrl/status`. Sending
  `{ "status": "completed" }` marks it done. Returns the full item.
  **Errors:** `400` bad status · `404` not found · `409` already completed.
- `DELETE` removes the item and its exercises (`204`).

### 🆕 GET `/schedule/:id/exercises`
Plan detail + the list of individual exercises (for the Plan Details screen).
```json
{
  "scheduleId": 1, "exercise": "squat", "date": "2026-05-03T21:43:43Z",
  "duration": 30, "notes": "Keep back straight", "video_url": "https://.../squat.mp4",
  "status": "pending", "doctorName": "Dr. Ana Rodrigues",
  "exercises": [
    { "id": 101, "name": "Ankle Pumps", "phase": "Warm Up", "sets": 3, "reps": 20,
      "holdSeconds": 0, "completed": false, "lastPainLevel": null }
  ]
}
```
`phase` ∈ `Warm Up` · `Strength` · `Mobility` · `Cooldown`. `holdSeconds` is `0` (never null).
`lastPainLevel` is `1–10` or `null`. **Errors:** `404` schedule not found.

### 🆕 POST `/schedule/:id/exercises`
Add an exercise to a plan (doctor / M2 side).
Body: `{ name, phase?, sets?, reps?, holdSeconds? }` → `201` with the created exercise object.

### 🆕 PATCH `/schedule/:id/exercises/:exerciseId/complete`
Mark one exercise done, with optional pain report.
```json
{ "painLevel": 3 }
```
`painLevel` optional, integer `1–10`. **`200`:**
```json
{ "exerciseId": 101, "completed": true, "painLevel": 3, "completedAt": "2026-05-03T14:45:00Z" }
```
**Errors:** `400` painLevel out of range · `404` exercise/schedule not found.

---

## 8. 🆕 Progress

### GET `/progress/:userId`
Combined patient progress for the Overview / ROM / Pain tabs. All values are computed from
real session, measurement and exercise data.
```json
{
  "userId": 1,
  "generated_at": "2026-06-05T10:00:00Z",
  "weekLabel": "Week 3 of 6",
  "rom": {
    "currentDegrees": 120, "targetDegrees": null, "weeklyGainDegrees": 15,
    "history": [ { "date": "2026-04-18", "degrees": 112 }, { "date": "2026-04-25", "degrees": 120 } ]
  },
  "adherence": {
    "weeklyPercent": 85, "completedExercises": 12, "totalExercises": 14,
    "skippedExercises": 2, "streakWeeks": 3,
    "weekDays": [ { "day": "Mon", "done": true, "isToday": false }, ... 7 entries ... ]
  },
  "pain": {
    "averageThisWeek": 4, "changeFromLastWeek": -2,
    "daily": [ { "date": "2026-04-19", "level": 6 }, ... 7 entries ... ]
  },
  "weeklySummary": { "avgSessionMinutes": 35, "activeDays": 5, "romGainDegrees": 8 }
}
```
**Notes:**
- `rom.currentDegrees` = peak joint angle from the latest measurement; `history` = weekly peaks.
- `targetDegrees` is `null` — V2 has no clinical ROM target stored yet.
- `pain.changeFromLastWeek` negative = improvement.
- `weekLabel` is derived from the plan/session date span (best effort).
- `404` if user not found.

---

## 9. Push, Feedback, Announcements, Audit (admin / M2)

| Endpoint | Body / Notes |
|----------|--------------|
| `POST /push/register` | `{ userId, token, platform }` → registers an FCM token |
| `GET /push/tokens/:userId` | List a user's tokens |
| `GET /feedback` `?status=` | List feedback; `GET /feedback/:id` one item |
| `POST /feedback` | `{ userId, content }` |
| `PATCH /feedback/:id` | `{ status, response }` (admin reply) |
| `GET/POST/PATCH/DELETE /announcements` | CRUD; `POST` `{ title, content, createdBy, status? }` |
| `GET /audit-logs` `?userId=&action=&targetType=` | Admin action history |

---

## 10. WebSocket — real-time feedback

Connect: `wss://<host>/ws?sessionId=<id>`. Events pushed during a session:

| `type` | When | `data` |
|--------|------|--------|
| `connected` | on connect | `{ sessionId }` |
| `movement_feedback` | a measurement is uploaded | `{ sessionId, timestamp, isCorrect, joint, angle }` |
| `session_ended` | the session is closed | `{ sessionId, timestamp }` |

---

*Maintained by Team V2. Last updated for the M1 v3.0 requirements round.*
