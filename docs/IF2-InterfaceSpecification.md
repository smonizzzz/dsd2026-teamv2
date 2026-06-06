# IF2 — Interface Specification (Server → Monitor)

**DSD 2025–2026 · UTAD × Jilin University**
**Owner: Team V2 (Backend API & Storage) · Consumers: M1 (Patient App), M2 (Clinical Dashboard)**

| Field | Value |
|-------|-------|
| Document ID | IF2 |
| Version | 2.0 |
| Status | Baseline — Sprint 3 |
| Aligned with | V2 SRS v1.1, M1 Requirements v3.0, M2 Admin UC set, `docs/API.md`, `docs/data-model.md` |
| Last updated | June 2026 |

## Revision History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | May 2026 | Initial REST contract (auth, sessions, measurements, recommendations, schedule, push) |
| 2.0 | Jun 2026 | Added doctor binding, plan exercises, progress, license replace/reject, feedback/announcements/audit, WebSocket; added requirements traceability matrix and open-issues register |

---

## 1. Introduction

### 1.1 Purpose
This document is the formal contract for the **IF2** interface — every interaction between
the **Server layer** (V2) and the **Monitor layer** (M1, M2). It defines transport,
conventions, the endpoint catalogue, the real-time channel, and the traceability between
requirements and interface elements. It is the authoritative reference for M1 and M2 when
integrating against V2.

### 1.2 Scope
IF2 covers the V2 backend surface consumed by M1 and M2. It does **not** cover:
- **IF1** — the Sensor → Server contract (S1/S2 ↔ V2), a separate document.
- The V2 ↔ V1 internal contract (measurement read + recommendation write-back).
- UI behaviour of M1/M2 or the AI model internals of V1.

Exhaustive request/response payloads live in **`docs/API.md`**; this specification governs
the contract, conventions, and traceability and shows the IF2-critical shapes inline.

### 1.3 Definitions & Acronyms
| Term | Meaning |
|------|---------|
| IF2 | Interface contract Server → Monitor (this document) |
| JWT | JSON Web Token bearer credential issued by V2 |
| ROM | Range of Motion (peak joint angle) |
| Bound / Unbound | Whether a patient has a `doctor_id` set (`0` = unbound) |
| Plan / Schedule | A scheduled exercise appointment for a patient |
| Plan exercise | An individual exercise inside a plan (sets/reps/hold) |
| IUC-V2-xx | V2 internal use case (V2 SRS) |
| UC-M1-xx | M1 use case (M1 SRS v3.0) |
| IUC-M2-ADMIN-xx | M2 admin use case |

### 1.4 References
- V2 SRS v1.1 — `index.html` (section 08 · SRS)
- V2 API Reference — `docs/API.md`
- V2 Data Model v2.0 — `docs/data-model.md`
- V2 System Design 2.0 — `docs/SystemDesign.md`
- M1 Requirements v3.0 (M1 → V2, 2026-06-04)
- M2 Admin use cases (IUC-M2-ADMIN-03/04/06/07/08/09)

---

## 2. Interface Overview

### 2.1 Position in the architecture
```
Sensor Layer ──IF1──▶ V2 (Server) ◀──internal──▶ V1 (AI)
                          │
                        IF2  ◀── this document
                          │
              ┌───────────┴───────────┐
              ▼                        ▼
        M1 Patient App          M2 Clinical Dashboard
```

### 2.2 Transport & protocols
- **REST/HTTP** with JSON bodies for all request/response operations.
- **WebSocket** for real-time session feedback (`/ws?sessionId=`).
- **multipart/form-data** for clinician license upload/replace only.

### 2.3 Base URLs
| Environment | URL | Transport | Note |
|-------------|-----|-----------|------|
| Huawei Cloud | `http://113.44.220.94:3000` | HTTP | Live integration server |
| Railway | `https://dsd2026-teamv2-production.up.railway.app` | HTTPS | Currently **down** |

> A frontend served over HTTPS (e.g. GitHub Pages) cannot call the HTTP Huawei server
> (browser Mixed-Content block). Until HTTPS is restored, M1/M2 web builds must use a
> non-HTTPS context or the Railway URL once revived. See §7.

---

## 3. Common Conventions

| Rule | Detail |
|------|--------|
| Auth | `Authorization: Bearer <jwt>` from `/auth/login` or `/auth/register`; valid 7 days. |
| Request casing | **camelCase** (`sessionId`, `doctorId`, `targetAngles`). |
| Response casing | User/session/measurement objects: **snake_case** (`doctor_id`, `user_id`). Nested progress/exercise objects: **camelCase**. Each endpoint in `docs/API.md` shows the exact shape. |
| Dates | Date-only: `YYYY-MM-DD`. Timestamps: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. |
| IDs | Integers. `doctor_id: 0` = patient not bound. |
| Empty collections | `[]`, never `null`. |
| Errors | `{ "error": "message" }` with the proper HTTP status. |
| Status codes | `200` read/update · `201` create · `204` delete · `400/401/403/404/409/410` errors. |

---

## 4. Interface Catalogue

Legend — Consumer: who on the Monitor layer calls it. Auth: ✓ enforced today, ○ planned (RBAC, Sprint 3).

### 4.1 Authentication & accounts
| Method | Path | Consumer | Auth | Purpose |
|--------|------|----------|:----:|---------|
| POST | `/auth/register` | M1, M2 | – | Register patient (open) / clinician (pending) |
| POST | `/auth/login` | M1, M2 | – | Obtain JWT |
| GET | `/auth/me` | M1, M2 | ✓ | Current profile (+ `conditionLabel`/`conditionDate`) |
| GET | `/auth/status` | M1, M2 | ✓ | Role + approval status |
| PATCH | `/auth/approve/:userId` | M2 | ✓ | Approve a pending clinician |
| PATCH | `/auth/reject/:userId` | M2 | ✓ | Reject a pending clinician |
| GET | `/users/:id` | M1, M2 | – | Verify a doctor before binding |
| PATCH | `/users/:id` | M1, M2 | – | Bind doctor (`doctorId`); modify/disable/role (admin) |
| GET | `/users` `?role=` | M2 | – | List doctors / patients |
| GET | `/users/:id/license` | M2 | – | Download clinician license |
| PATCH | `/users/:id/license` | M2 | – | Replace license (resets to `pending`) |
| GET | `/patients` · `/patients/:id` | M2 | – | Patient records |

### 4.2 Sessions & measurements
| Method | Path | Consumer | Purpose |
|--------|------|----------|---------|
| POST | `/sessions` | M1 | Start a session |
| PATCH | `/sessions/:id/end` | M1 | End a session |
| GET | `/sessions/:id` | M1, M2 | Session detail + measurements (`target_angles`/`errors`/`sensor_data`) |
| GET | `/sessions` `?userId=` | M2 | List sessions |
| DELETE | `/sessions/:id` | M2 | Delete a session (cascade) |
| POST | `/measurements` | M1 | Upload one (`jointAngles` **or** `targetAngles`+`sensorData`) |
| POST | `/measurements/batch` | M1 | Upload many |
| GET | `/measurements/:sessionId` | M1, M2 | List (`?startDate=&endDate=`) |

### 4.3 Recommendations, schedule, progress
| Method | Path | Consumer | Purpose |
|--------|------|----------|---------|
| GET | `/recommendations/engine/:userId` | M1, M2 | AI accuracy analysis |
| GET | `/recommendations/session/:sessionId` | M1, M2 | Session recommendations |
| POST · PATCH | `/recommendations` · `/recommendations/:id` | M2 | Create / update status |
| GET | `/schedule/:userId` | M1 | Plan list (`video_url`, `notes`, `doctor_name`) |
| POST · PATCH · DELETE | `/schedule` · `/schedule/:id` | M2 | Manage plan items |
| GET | `/schedule/:id/exercises` | M1 | Plan detail + exercises |
| POST | `/schedule/:id/exercises` | M2 | Add an exercise |
| PATCH | `/schedule/:id/exercises/:exerciseId/complete` | M1 | Mark exercise done (+`painLevel`) |
| GET | `/progress/:userId` | M1, M2 | Patient progress (ROM/adherence/pain) |

### 4.4 Push & admin
| Method | Path | Consumer | Purpose |
|--------|------|----------|---------|
| POST · GET | `/push/register` · `/push/tokens/:userId` | M1 | Device token registry |
| GET · PATCH | `/feedback` · `/feedback/:id` | M2 | User feedback management |
| GET·POST·PATCH·DELETE | `/announcements` | M2 | Announcements |
| GET | `/audit-logs` | M2 | Admin action log |

### 4.5 IF2-critical payloads (inline)
**Doctor binding** — `PATCH /users/:id` `{ "doctorId": 5 }` → user object with `doctor_id: 5`.
Errors: `400` bad id · `403` target not clinician · `404` not found · `409` already bound.

**Plan detail** — `GET /schedule/:id/exercises` →
```json
{ "scheduleId":1, "exercise":"squat", "video_url":"…", "status":"pending",
  "doctorName":"Dr. Ana", "exercises":[
    { "id":101, "name":"Ankle Pumps", "phase":"Warm Up", "sets":3, "reps":20,
      "holdSeconds":0, "completed":false, "lastPainLevel":null } ] }
```

**Progress** — `GET /progress/:userId` → `{ weekLabel, rom{currentDegrees,targetDegrees,weeklyGainDegrees,history[]}, adherence{weeklyPercent,completedExercises,totalExercises,skippedExercises,streakWeeks,weekDays[7]}, pain{averageThisWeek,changeFromLastWeek,daily[7]}, weeklySummary{avgSessionMinutes,activeDays,romGainDegrees} }` (see `docs/API.md` §8).

---

## 5. WebSocket Interface

Connect: `ws://<host>/ws?sessionId=<id>`.

| Event `type` | Trigger | `data` |
|--------------|---------|--------|
| `connected` | on connect | `{ sessionId }` |
| `movement_feedback` | a measurement is uploaded | `{ sessionId, timestamp, isCorrect, joint, angle }` |
| `session_ended` | the session is closed | `{ sessionId, timestamp }` |

---

## 6. Requirements Traceability Matrix

Each interface element is traced to the requirement(s) it satisfies.

| Requirement | Source | Interface element(s) |
|-------------|--------|----------------------|
| IUC-V2-01 Patient Registration | V2 SRS | `POST /auth/register` (patient) |
| IUC-V2-02 Clinician Registration | V2 SRS | `POST /auth/register` (multipart) |
| IUC-V2-03 User Login | V2 SRS | `POST /auth/login` |
| IUC-V2-04 Clinician Approval / Rejection | V2 SRS | `PATCH /auth/approve/:userId`, `PATCH /auth/reject/:userId` |
| IUC-V2-05 / 06 Session lifecycle | V2 SRS | `POST /sessions`, `PATCH /sessions/:id/end` |
| IUC-V2-07 Record Measurements | V2 SRS | `POST /measurements`, `/batch`, `/raw` |
| IUC-V2-08 Query Measurements | V2 SRS | `GET /measurements/:sessionId`, `GET /sessions/:id` |
| IUC-V2-09 Access Patient Records | V2 SRS | `GET /patients`, `GET /patients/:id` |
| IUC-V2-10 Manage Recommendations | V2 SRS | `/recommendations` (engine, session, POST, PATCH) |
| IUC-V2-11 Manage Schedule | V2 SRS | `GET /schedule/:userId`, `POST/PATCH/DELETE /schedule/:id` |
| IUC-V2-12 / 13 Push | V2 SRS | `POST /push/register`, `GET /push/tokens/:userId` |
| IUC-V2-14 Bind Patient to Doctor | V2 SRS v1.1 | `GET /users/:id`, `PATCH /users/:id` `{doctorId}` |
| IUC-V2-15 Manage User Account | V2 SRS v1.1 | `PATCH /users/:id`, `GET /users?role=` |
| IUC-V2-16 Manage Plan Exercises | V2 SRS v1.1 | `GET/POST /schedule/:id/exercises`, `PATCH .../complete` |
| IUC-V2-17 Track Patient Progress | V2 SRS v1.1 | `GET /progress/:userId` |
| IUC-V2-18 Manage Feedback & Announcements | V2 SRS v1.1 | `/feedback`, `/announcements` |
| IUC-V2-19 Query Audit Log | V2 SRS v1.1 | `GET /audit-logs` |
| UC-M1-01-01 Register + bind doctor | M1 v3.0 | `POST /auth/register`, `GET /users/:id`, `PATCH /users/:id` |
| UC-M1-04-01/02 Plan detail + video | M1 v3.0 | `GET /schedule/:id/exercises` (`video_url`) |
| UC-M1-04-03 Complete exercise | M1 v3.0 | `PATCH /schedule/:id/exercises/:exerciseId/complete` |
| UC-M1-06-01 Change doctor (settings) | M1 v3.0 | `PATCH /users/:id` `{doctorId}` |
| (M1 progress screen) | M1 v3.0 | `GET /progress/:userId` |
| IUC-M2-ADMIN-03/04 Doctor/Patient account mgmt | M2 | `GET /users?role=`, `PATCH /users/:id` |
| IUC-M2-ADMIN-06 Feedback management | M2 | `GET/PATCH /feedback` |
| IUC-M2-ADMIN-07 Content management | M2 | `GET/POST/PATCH/DELETE /announcements` |
| IUC-M2-ADMIN-08 Role & permission mgmt | M2 | `PATCH /users/:id` (`role`) |
| IUC-M2-ADMIN-09 Audit log | M2 | `GET /audit-logs` |

---

## 7. Cross-team Interface Conflicts & Open Issues

| ID | Issue | Status | Owner(s) |
|----|-------|--------|----------|
| Conflict 4 | Raw IMU ingestion schema (S2 payload vs V2 measurements) — `/measurements/raw` accepts it as free JSON, formal schema undecided | **Open** | S2 · V1 · V2 |
| OI-1 | V1 `is_correct` write-back: no endpoint/mechanism defined; measurements stay `is_correct=false` | **Open** | V1 · V2 |
| OI-2 | RBAC not enforced at route level — most endpoints currently open | **Open** (Sprint 3) | V2 |
| OI-3 | HTTPS unavailable on Huawei (no domain) → Mixed-Content blocks HTTPS frontends; Railway down | **Open** | V2 |
| OI-4 | Doctor-binding model: IF2 uses open-register-then-bind (Model A). The `2nd-implementation` branch uses mandatory invite tokens (Model B) — must not regress | **Decided: Model A** | V2 · M1 |
| OI-5 | `targetAngles[].angleID` is stored/returned verbatim (not transformed to `angle_id`) — M1 to confirm | **Pending confirmation** | M1 · V2 |

---

## 8. Gaps & Assumptions

**Documented gaps (could not be resolved from available documentation):**
- **M2 SRS not machine-readable:** the M2 site is a client-rendered SPA; M2 use-case IDs
  used here come from the admin requirement list M2 sent directly, not from a published SRS.
- **S1 / IF1 detail unavailable:** the S1 site exposes no firmware/protocol spec; IF1 field
  schema is referenced ("Total Interface Specification v2.0") but not accessible to V2.
- **"Total Interface Specification v2.0"** (referenced by S2) is not in the V2 repository;
  this IF2 document covers only the Server→Monitor contract V2 owns.
- **V1 ↔ V2 recommendation/`is_correct` contract** is not formally specified by V1.

**Assumptions:**
- Each patient has exactly one active account and at most one bound doctor.
- Admin role exists (seeded). RBAC enforcement deferred to Sprint 3.
- Academic prototype: no GDPR/health-data compliance obligation this phase.
- All timestamps ISO 8601 UTC; V2 normalises on read.

---

## 9. Versioning & Change Management

IF2 is owned by V2. Breaking changes require notice to M1 and M2 and a version bump.
Additive endpoints/fields are backward-compatible (M1/M2 ignore unknown fields). This
document, `docs/API.md`, the V2 SRS, and `docs/data-model.md` must be updated together
whenever the interface changes.
