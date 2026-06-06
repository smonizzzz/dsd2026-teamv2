# System Design 2.0

**DSD 2025–2026 · UTAD × Jilin University · Team V2 — Backend API & Storage**

---

## Revision History

| Version | Date | Description |
| ------- | ---- | ----------- |
| 1.0 | April 9 | Initial version |
| 2.0 | June 2026 | Sprint 3 baseline — JWT auth, doctor binding, schedule + exercises, progress, feedback/announcements/audit, WebSocket, dual deployment |

---

## Introduction

The system is a distributed limb-motion rehabilitation platform built by six teams across
three layers. The **V2 backend** is the central communication and storage layer: it
authenticates users, stores all persistent data, ingests sensor measurements, serves data
to the patient app and clinical dashboard, and exchanges data with the AI engine.

---

## Architecture

```
                 Sensor Layer            Server Layer              Monitor Layer
   ┌────────────┐   ┌────────────┐   ┌──────────────────┐   ┌────────────────────┐
   │ S1 Firmware│──▶│ S2 Data    │──▶│ V2 Backend  ◀──▶ V1│──▶│ M1 Patient App     │
   │ & Protocol │   │ Acquisition│   │ API & Storage   AI │   │ M2 Clinical Dash   │
   └────────────┘   └────────────┘   └──────────────────┘   └────────────────────┘
                            (IF1)            (internal)            (IF2)
```

- **IF1** — Sensor → Server contract (S2 ↔ V2). One conflict open (Conflict 4, raw IMU schema).
- **IF2** — Server → Monitor contract (V2 ↔ M1/M2). See `docs/IF2-InterfaceSpecification.md`.
- **Internal** — V2 ↔ V1 (measurement read + recommendation write-back).

---

## Intermediate (V2 Backend)

*Version 2.0 — Node.js + Express, SQLite via sql.js*

### Responsibilities
- User registration, JWT authentication, clinician approval/rejection, license upload/replace
- Doctor ↔ patient binding
- Session lifecycle and measurement ingestion (single, batch, raw IMU)
- Patient records, recommendations, schedules and per-exercise tracking
- Patient progress aggregation (ROM / adherence / pain)
- Feedback, announcements and an admin audit log
- Push-token registry and real-time WebSocket feedback

### API surface (by group)
`/health` · `/auth` (register, login, me, status, approve, reject) · `/users`
(incl. `:id/license`, doctor binding) · `/patients` · `/sessions` · `/measurements`
(+`/batch`, +`/raw`) · `/recommendations` (engine, session) · `/schedule`
(+`/:id/exercises`, +`.../complete`) · `/progress` · `/push` · `/feedback` ·
`/announcements` · `/audit-logs` · WebSocket `ws://host/ws?sessionId=`.

Full request/response detail: `docs/API.md`. Formal Monitor contract: `docs/IF2-InterfaceSpecification.md`.

### Internal architecture (MVC)
- **Routes** (`src/routes`) — endpoint definitions only
- **Controllers** (`src/controllers`) — validation + business logic
- **DB layer** (`src/db`) — `connection.js`, `init.js` (schema + migrations + admin seed), `helpers.js` (queries + date normalisation), `audit.js`
- **Middleware** (`src/middleware`) — `auth.js` (JWT), `upload.js` (Multer), `errorHandler.js`
- **Realtime** (`src/realtime/feedbackSocket.js`) — WebSocket broadcast
- **Utils** (`src/utils`) — access-control helpers (groundwork for RBAC)

---

## Back-end (Database)

SQLite (sql.js, pure JS). Tables: `users`, `sessions`, `measurements`, `recommendations`,
`schedules`, `schedule_exercises`, `push_tokens`, `feedback`, `announcements`,
`audit_logs`. Schema is created and migrated automatically on startup; the admin account is
seeded if missing. Full detail in `docs/data-model.md`.

---

## System Workflow

1. Patient registers in M1 (open) and is bound to a doctor via `PATCH /users/:id`.
2. M1 starts a session (`POST /sessions`).
3. S2 / M1 stream measurements (`POST /measurements[/batch|/raw]`); V2 broadcasts live feedback over WebSocket.
4. V1 reads measurements (`GET /measurements/:sessionId`), classifies, and writes recommendations (`POST /recommendations`). *(is_correct write-back still open.)*
5. M1 ends the session (`PATCH /sessions/:id/end`).
6. M1 shows plan, plan exercises and progress; M2 reviews patients, recommendations and admin data.

---

## Request Lifecycle

```
Client → CORS → express.json() → Router → (requireAuth?) → Controller
       → DB helpers (+ normalizeDates) → sql.js → save() → JSON response
       (uncaught errors → errorHandler → { "error": "..." })
```

---

## Non-functional Requirements

- **Performance:** reads < 200 ms (≤10k rows); batch inserts < 500 ms (≤500 rows).
- **Security:** bcrypt password hashing (cost ≥ 10); JWT on protected routes; license paths never exposed.
- **Reliability:** idempotent schema migrations; atomic batch inserts; always-on `/health`.
- **Maintainability:** strict MVC; centralised date normalisation; zero native modules.
- **Scalability:** stateless API; modular routers.

---

## Technical Route Selection

- **Backend:** Node.js ≥ 18 + Express
- **Database:** SQLite (sql.js)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Realtime:** ws (WebSocket)
- **Uploads:** Multer
- **Deployment:** Railway (HTTPS, currently down) + Huawei Cloud (`113.44.220.94:3000`, PM2)

---

## Open Issues

- **Conflict 4 (IF1):** raw IMU ingestion schema pending S2 + V1 + V2 decision.
- **V1 `is_correct` write-back:** mechanism undefined; measurements stay `is_correct=false`.
- **RBAC:** route-level role enforcement not yet applied (Sprint 3).
- **HTTPS on Huawei:** server is HTTP-only (no domain); Mixed-Content blocks HTTPS frontends.

---

## Conclusion

V2 remains the integration backbone of the platform. Version 2.0 reflects the Sprint 3
reality: a complete authenticated REST + WebSocket surface consumed by every other team,
with the remaining work concentrated in cross-team contracts (Conflict 4, is_correct) and
hardening (RBAC, HTTPS).
