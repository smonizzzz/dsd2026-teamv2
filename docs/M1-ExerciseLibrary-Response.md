# V2 Response — Exercise Library & Prescription Workflow

**From:** V2 Team (Backend)
**To:** M1 Team (Patient Mobile App)
**Date:** 2026-06-07
**Re:** Your "Exercise Library & Prescription Workflow" request (2026-06-07)

---

## Summary

Everything you requested is **implemented and tested**. All four endpoints are ready.
Base URL for integration: **`http://113.44.220.94:3000`** (Huawei). Railway is currently down.

| Priority | Method | Path | Status |
|---|---|---|---|
| 🔴 1 | `GET` | `/exercises` | ✅ Done (open, no auth) |
| 🔴 2 | `GET` | `/schedule/{scheduleId}/exercises` | ✅ Now returns `gif_url`, `description`, `notes` |
| 🔴 3 | `POST` | `/schedule/{scheduleId}/exercises` | ✅ Now accepts `gif_url`, `description`, `notes` |
| 🟠 4 | `PATCH` | `/schedule/{scheduleId}/exercises/{exerciseId}/complete` | ✅ Confirmed — accepts `pain_level` |

---

## Answers to your open questions (§9)

1. **Does `GET /exercises` require auth?** → **No, it is open** (public). You may send a token; it is not required.
2. **Does `GET /schedule/{id}/exercises` return `gif_url`, `description`, `notes`?** → **Yes, now it does.** Always present (null when unset).
3. **Is `PATCH .../complete` implemented?** → **Yes.** It accepts both `pain_level` (your new format) and `painLevel`.
4. **Exact shape of `GET /schedule/{userId}`?** → documented in §5 below.

---

## 1. `GET /exercises` — exercise catalogue

Open endpoint. Seeded with the 10 exercises you listed.

**Request:** `GET /exercises`

**Response `200`:**
```json
[
  { "id": 1, "name": "Squat", "category": "Lower Body",
    "description": "3 reps, ~5 s each. Feet shoulder-width apart, knees aligned with toes.",
    "gif_url": null }
]
```
- `gif_url` is **always present**, value `null` for now (see note below).
- `401` only if you choose to send an invalid token (not required).

> ⚠️ **Important about `gif_url`:** we store it as an **animated GIF URL** (as your table specified).
> Your examples showed YouTube links — those are not GIFs, so we ignored them. The catalogue is
> currently seeded with `gif_url: null`. **Real GIF URLs must be filled in by the clinical/M2
> side** before the app can show a demonstration. Until then, M1 should show the "Video not
> available" placeholder when `gif_url` is null.

---

## 2. `GET /schedule/{scheduleId}/exercises` — plan detail

**Response `200`:**
```json
{
  "scheduleId": 1,
  "exercise": "squat",
  "date": "2026-05-03T21:43:43Z",
  "duration": 30,
  "notes": "Keep back straight",
  "video_url": "https://.../squat.mp4",
  "status": "pending",
  "doctorName": "Dr. Ana Rodrigues",
  "exercises": [
    {
      "id": 101,
      "name": "Squat",
      "phase": "Strength",
      "sets": 3,
      "reps": 10,
      "holdSeconds": 2,
      "notes": "Stop immediately if you feel sharp knee pain.",
      "gif_url": "https://.../squat.gif",
      "description": "3 reps, ~5 s each. Feet shoulder-width apart.",
      "completed": false,
      "lastPainLevel": null
    }
  ]
}
```
Per-exercise fields: `holdSeconds` is `0` (never null); `notes`/`gif_url`/`description` are always
present (null when unset); `lastPainLevel` is 1–10 or null. `404` if the schedule is not found.

---

## 3. `POST /schedule/{scheduleId}/exercises` — add an exercise

Accepts your snake_case fields (`hold_seconds`, `gif_url`) **and** camelCase (`holdSeconds`).

**Request body:**
```json
{
  "name": "Squat",
  "phase": "Strength",
  "sets": 3,
  "reps": 10,
  "hold_seconds": 2,
  "notes": "Stop immediately if you feel sharp knee pain.",
  "gif_url": "https://.../squat.gif",
  "description": "3 reps, ~5 s each. Feet shoulder-width apart."
}
```
Required: `name`, `phase` (`Warm Up` / `Strength` / `Mobility` / `Cooldown`). Returns `201` with the
created exercise object (same shape as in §2). `404` if the schedule is not found.

---

## 4. `PATCH /schedule/{scheduleId}/exercises/{exerciseId}/complete`

**Request body** (both accepted):
```json
{ "pain_level": 3 }
```

**Response `200`:**
```json
{ "exerciseId": 101, "completed": true, "painLevel": 3, "completedAt": "2026-06-07T14:30:00Z" }
```
`pain_level`/`painLevel` is optional (1–10). `400` if out of range; `404` if not found.

---

## 5. `GET /schedule/{userId}` — confirmed shape

```json
[
  {
    "id": 1,
    "user_id": 1,
    "exercise": "squat",
    "date": "2026-05-03T21:43:43Z",
    "duration": 30,
    "notes": "Keep back straight",
    "video_url": "https://.../squat_demo.mp4",
    "status": "pending",
    "doctor_name": "Dr. Ana Rodrigues",
    "created_at": "2026-05-02T13:43:46Z"
  }
]
```
- Ordered by `date` ascending.
- `notes` is **always a string** (empty `""` if none). `video_url` and `doctor_name` are always
  present (may be null).
- `status` ∈ `pending` / `completed` / `skipped`.

---

## Notes on casing

Your request mixed snake_case (`hold_seconds`, `pain_level`) with your own §8 rule (camelCase).
To avoid breaking either side, our endpoints **accept both** casings on input. In responses,
the exercise object uses `holdSeconds`/`lastPainLevel` (camelCase) and `gif_url`/`description`
(snake_case) — exactly matching the example shapes in your document.

---

*Full reference: `docs/API.md`. Formal contract: `docs/IF2-InterfaceSpecification.md` (v2.1).*
*Please let us know if any shape doesn't parse cleanly and we'll adjust quickly.*
