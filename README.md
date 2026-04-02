# V2 — Backend API & Storage

**Distributed Software Development (DSD) 2025–2026**
UTAD × Jilin University

---

## 📌 Overview

Team V2 is the central integration hub of the **Limb Motion Recognition and Assistant System**.

This backend is responsible for managing data, processing movement measurements, and generating exercise recommendations.

---

## 🧠 System Architecture

The system follows a layered architecture:

Sensor Layer → Server Layer (V2) → Monitor Layer

* **S1/S2** → Sensor data acquisition (joint angles, movement data)
* **V1** → AI processing (optional integration)
* **V2 (this backend)** → Data storage, processing, and API
* **M1/M2** → Frontend applications

---

## ⚙️ Tech Stack

* **Backend:** Node.js (Express)
* **Database:** SQLite (via sql.js)
* **API:** REST
* **Data Format:** JSON

> SQLite was chosen for simplicity and fast development during early project stages.

---

## 📁 Project Structure

```
src/
│
├── routes/         # API endpoints
├── controllers/    # Request handling logic
├── db/             # Database connection and helpers
├── middleware/     # Error handling
│
├── app.js          # Main server file
```

---

## 🔗 Responsibilities

### Backend API

* Provide REST endpoints for all system entities
* Handle incoming sensor data
* Serve processed data to frontend

### Database

* Store users, sessions, measurements, and recommendations
* Ensure data consistency
* Persist session history

### Integration

* Receive data from sensor systems (S2)
* Provide structured data to frontend (M1/M2)
* Support integration with AI module (V1)

---

## 🗄️ Data Model

The system includes four main entities:

* **User** → system user (patient or clinician)
* **Session** → exercise session
* **Measurement** → captured movement data
* **Recommendation** → performance feedback

Relationships:

* One user → multiple sessions
* One session → multiple measurements
* One session → multiple recommendations

---

## 🔌 API Endpoints

Base URL:

```
http://localhost:3000/
```

### 👤 Users

* `GET /users`
* `GET /users/:id`
* `POST /users`

---

### 🕒 Sessions

* `GET /sessions`
* `GET /sessions/:id`
* `POST /sessions`
* `PATCH /sessions/:id/end`

---

### 📏 Measurements

* `GET /measurements/:sessionId`
* `POST /measurements`
* `POST /measurements/batch`

---

### 💡 Recommendations

* `GET /recommendations/session/:sessionId`
* `GET /recommendations/engine/:userId`
* `POST /recommendations`
* `PATCH /recommendations/:id`

---

## 🧠 Recommendation Engine

The system includes a rule-based recommendation engine.

It:

1. Analyzes measurements from recent sessions
2. Calculates accuracy per joint
3. Generates feedback

### Example logic:

* Accuracy < 50% → High priority
* Accuracy 50–70% → Medium priority
* Accuracy > 70% → Good performance

---

## ⚡ Real-Time Communication

Real-time communication is **not yet implemented**.

> Future work may include WebSocket support for live feedback.

---

## 🔐 Authentication

Authentication is **not yet implemented**.

> JWT-based authentication is planned for future development.

---

## 🚀 Getting Started

### 1. Install dependencies

```
npm install
```

### 2. Run the server

```
npm run dev
```

### 3. Test the API

```
http://localhost:3000/health
```

---

## 📅 Current Status

✔️ Core backend fully functional
✔️ Data persistence implemented
✔️ Recommendation engine implemented
⚠️ Authentication not implemented
⚠️ Real-time communication not implemented

---

## 👥 Team Roles

* System Architect / PM — Architecture and API design
* Developers — Backend implementation and database management

---

## 👑 Vision

V2 acts as the backbone of the system.

It ensures:

* Reliable data storage
* Clear API communication
* Integration between all components

---

## 📬 Communication

* API documentation shared with frontend teams
* Integration via REST endpoints
* Future support for real-time communication

---
