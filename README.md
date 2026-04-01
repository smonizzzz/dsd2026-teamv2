# V2 — Backend API & Storage

Distributed Software Development (DSD) 2025–2026
UTAD × Jilin University

---

## 📌 Overview

Team V2 is the central integration hub of the Limb Motion Recognition and Assistant system.

We are responsible for:

* Backend API (REST & WebSocket)
* Database & data persistence
* Integration between Sensor (S1/S2), AI (V1), and Monitor (M1/M2) teams
* Exercise recommendation engine

From Sprint 3 onwards, V2 assumes the **Integration Lead role**, coordinating system-wide testing across all teams.

---

## 🧠 System Architecture

The system follows a layered architecture:

Sensor Layer → Server Layer (V2) → Monitor Layer

* **S1/S2**: Sensor data acquisition
* **V1**: AI & motion recognition
* **V2 (this team)**: Backend + Database
* **M1/M2**: Frontend applications

---

## ⚙️ Tech Stack

* **Backend**: Node.js (Express)
* **Database**: PostgreSQL
* **ORM**: Prisma
* **Authentication**: JWT
* **Real-time**: WebSockets

---

## 📁 Project Structure

```bash
v2-backend/
│
├── src/
│   ├── routes/        # API endpoints
│   ├── controllers/   # Request handling logic
│   ├── services/      # Business logic
│   ├── middleware/    # Auth & validation
│
├── prisma/
│   └── schema.prisma  # Database schema
│
├── docs/
│   ├── api.md         # API documentation (IF2)
│   ├── data-model.md  # Database design
│
├── .env.example       # Environment variables template
├── README.md
```

---

## 🔗 Responsibilities

### Backend API

* Design and implement REST endpoints
* Provide WebSocket streams for real-time data
* Define request/response schemas

### Database

* Design data model (User, Session, Measurement, Recommendation)
* Handle data ingestion from sensors
* Store AI outputs and session history

### Integration

* Receive sensor data (S2)
* Integrate AI outputs (V1)
* Serve data to frontend (M1/M2)

---

## 🔌 API (IF2)

The API follows REST principles and versioning:

Base URL:

```
/api/v1/
```

Example endpoints:

* `GET /api/v1/sessions/:userId`
* `POST /api/v1/sessions`
* `POST /api/v1/auth/login`

Full API specification available in:

```
docs/api.md
```

---

## ⚡ Real-Time Communication

WebSocket endpoint:

```
ws://server/api/v1/live
```

Used for:

* Live sensor updates
* Real-time feedback during sessions

---

## 🔐 Authentication

* JWT-based authentication
* Token passed via:

  * REST → Authorization header
  * WebSocket → query parameter

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment variables

Copy:

```bash
.env.example → .env
```

### 3. Run the server

```bash
npm run dev
```

---

## 👥 Team Roles

* **System Architect / PM** — Architecture, API design, database model
* **Vice PM** — Coordination & async communication
* **Programmer PT** — API implementation
* **Programmer CN** — Database implementation

---

## 📅 Sprint 1 Goals

* Define system architecture
* Design database schema
* Draft IF2 (API contract with M1)
* Setup development environment
* Align data formats with S2 and V1

---

## ⚠️ Important Notes

* IF2 must be finalized by the end of Sprint 2
* Backend decisions must be centralized in V2
* Early alignment with M1 is critical to avoid rework

---

## 📬 Communication

* Async updates via GitHub Wiki
* Cross-team coordination via WeChat
* Formal API contracts documented in `/docs`

---

## 👑 Vision

V2 is the backbone of the system.

We ensure:

* Data consistency
* System reliability
* Seamless integration between all teams
