# V2 API — Access Control (RBAC) Change Notice

**From:** V2 Team (Backend)
**To:** M1 (Patient App) and M2 (Clinical Dashboard / Admin)
**Date:** 2026-06-09
**Priority:** 🔴 Action required — breaking change for admin operations and doctor assignment

---

We've enabled role-based access control on the V2 backend. The **data endpoints you already
use keep working unchanged**, but the **administration operations now require an admin login**,
and **doctor assignment has moved to the admin**. Please read the action items for your team.

**Base URL (unchanged):** `http://113.44.220.94:3000`

---

## What changed

Admin-only operations are now gated. The following require a token from an **admin** account
(`admin@v2.dsd`):

- `PATCH /auth/approve/:userId`, `PATCH /auth/reject/:userId`
- `GET /users`, `POST /users`
- `PATCH /users/:id` when changing `role`, `status`, or **`doctorId`** (doctor assignment)
- `GET /audit-logs`
- `POST` / `PATCH` / `DELETE /announcements`
- `GET` / `PATCH /feedback`

Calling these without an admin token now returns **401** (no token) or **403** (not admin).

---

## Action required — M2 (Clinical Dashboard / Admin)

1. Log in as the admin account to obtain an admin JWT:
   `POST /auth/login` → `{ "email": "admin@v2.dsd", "password": "Admin2026!" }`
2. Send that token (`Authorization: Bearer <token>`) on all the admin operations listed above.
3. **Doctor → patient assignment is now an admin task.** To assign a doctor to a patient:
   - `GET /users?role=patient` (list patients) · `GET /users?role=clinician` (list doctors)
   - `PATCH /users/{patientId}` with `{ "doctorId": <clinicianId> }`

## Action required — M1 (Patient App)

1. **Remove the self-binding step.** Patients can **no longer** assign their own doctor —
   `PATCH /users/{id}` with `doctorId` now returns **403** for a patient. Doctor assignment is
   done by the admin via M2.
2. A patient registers and stays `doctor_id: 0` until an admin assigns a doctor.
3. Patients **can** still edit their own profile fields (`name`, `age`, `conditionLabel`,
   `conditionDate`) via `PATCH /users/{id}` — only `role`/`status`/`doctorId` are blocked.
4. Reminder: a plan can only be created for a patient **after** a doctor is assigned (otherwise
   `POST /schedule` returns `409 — Patient has no doctor assigned`).

---

## What did NOT change (no action needed)

These keep working exactly as before:

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Sessions, measurements (upload + read), recommendations, schedule + plan exercises, progress, push tokens
- `GET /exercises`, `GET /users/:id` (doctor lookup), license upload/replace

---

## Correct end-to-end flow now

1. Patient registers in M1 (unbound).
2. **Admin (M2)** assigns a doctor: `PATCH /users/{patientId}` `{ "doctorId": X }`.
3. Doctor / M2 creates the plan and exercises for that patient.
4. Patient sees and completes the plan in M1.

---

*Full reference: `docs/API.md` (Access control section) and `docs/IF2-InterfaceSpecification.md`.*
*Let us know if anything in your integration breaks and we'll help adjust.*
