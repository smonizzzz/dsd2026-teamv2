# V2 Backend — API & Storage
**DSD 2025-2026 · UTAD × Jilin University · Team V2**

---

## How to Run (Windows)

### Option 1 — Double-click
Double-click **setup.bat** — it installs everything and starts the server automatically.

### Option 2 — Terminal
Open PowerShell or CMD **inside the v2-backend folder**, then:
```
npm install
node src/server.js
```

> IMPORTANT: Always run commands from inside the v2-backend folder, NOT from inside src/

---

## Requirements
- Node.js v18 or higher: https://nodejs.org
- No Python needed, no Visual Studio needed

---

## Verify it works
Open: http://localhost:3000/health

Expected:
```json
{ "status": "ok", "team": "V2 - Backend API & Storage" }
```

---

## Folder Structure
```
v2-backend/
├── setup.bat          <- Double-click to run (Windows)
├── package.json
├── data/
│   └── v2.db          <- SQLite database (auto-created on first run)
└── src/
    ├── server.js      <- Entry point
    ├── db/
    │   ├── connection.js
    │   ├── init.js
    │   └── helpers.js
    ├── middleware/
    │   └── errorHandler.js
    ├── routes/
    │   ├── users.js
    │   ├── sessions.js
    │   ├── measurements.js
    │   └── recommendations.js
    └── controllers/
        ├── usersController.js
        ├── sessionsController.js
        ├── measurementsController.js
        └── recommendationsController.js
```

---

## All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Server status |
| GET | /users | List all users |
| GET | /users/:id | Get user by id |
| POST | /users | Create user `{ name, email, role }` |
| GET | /sessions | List sessions (optional ?userId=1) |
| GET | /sessions/:id | Session detail + measurements |
| POST | /sessions | Start session `{ userId }` |
| PATCH | /sessions/:id/end | Close session |
| GET | /measurements/:sessionId | Measurements for session |
| POST | /measurements | Add measurement `{ sessionId, jointAngles, isCorrect }` |
| POST | /measurements/batch | Add multiple measurements |
| GET | /recommendations/session/:id | Recommendations for session |
| GET | /recommendations/engine/:userId | AI analysis by user |
| POST | /recommendations | Create recommendation |
| PATCH | /recommendations/:id | Update status |

---

## Test with PowerShell

```powershell
# 1. Create user
Invoke-RestMethod -Uri http://localhost:3000/users -Method POST `
  -ContentType "application/json" `
  -Body '{"name":"Ana Costa","email":"ana@utad.pt","role":"patient"}'

# 2. Start session
Invoke-RestMethod -Uri http://localhost:3000/sessions -Method POST `
  -ContentType "application/json" -Body '{"userId":1}'

# 3. Add measurement
Invoke-RestMethod -Uri http://localhost:3000/measurements -Method POST `
  -ContentType "application/json" `
  -Body '{"sessionId":1,"jointAngles":{"knee":45.2,"hip":30.1},"isCorrect":true}'

# 4. View session
Invoke-RestMethod -Uri http://localhost:3000/sessions/1
```

---

## Integration with Other Teams

| Team | What they do |
|------|-------------|
| S2 — Sensors | POST /measurements (send sensor data) |
| V1 — AI | POST /measurements with isCorrect from model |
| M1 — Mobile App | GET /sessions, GET /recommendations/engine/:userId |
| M2 — Dashboard | GET /sessions/:id, GET /recommendations/session/:id |
