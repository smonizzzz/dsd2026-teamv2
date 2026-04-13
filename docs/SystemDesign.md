# System Design 1.0

**DSD 2025–2026 · UTAD × Jilin University · Team V2**

---

## Revision History

| Date    | Description                     |
| ------- | ------------------------------- |
| April 9 | Initial version (1.0) completed |

---

## Introduction

The system is designed as a distributed architecture composed of multiple modules: front-end, server (V2), database, and algorithm components.

The V2 backend acts as the central communication layer, handling API requests, managing data storage, and coordinating interactions between other teams.

---

## Functional Requirement Clustering

The system is divided into three main components:

* **Front-end**: Mobile application and sensors (IMU devices)
* **Intermediate**: V2 backend server
* **Back-end**: Database and algorithm modules

### Component Diagram (description)

The architecture follows this structure:

```
[Mobile App / Sensors]
          ↓
       [V2 Server]
      /           \
[Database]     [AI Module]
```

### Description

* The front-end collects user data and sensor measurements
* The server processes requests and manages communication
* The database stores persistent data
* The AI module analyzes motion and generates recommendations

---

## Front-end (draft)

*Version 1.0*

The front-end interacts with users through a mobile application and IMU sensors.

### Responsibilities

* User interaction (login, sessions)
* Sending sensor data to the server
* Displaying results and recommendations

---

## Intermediate (V2 Backend)

*Version 1.0*

The V2 backend is implemented using **Node.js and Express**.

### Responsibilities

The server acts as the central hub of the system:

* Receives sensor data from **S2 (Sensors team)**
* Receives processed results from **V1 (AI team)**
* Provides data to:

  * **M1 (Mobile App)**
  * **M2 (Dashboard)**

### API Endpoints

The backend exposes RESTful APIs:

* `/health` → server status
* `/users` → user management
* `/sessions` → session lifecycle
* `/measurements` → sensor data collection
* `/recommendations` → AI feedback and suggestions

### Internal Architecture

The backend follows an MVC-like structure:

* **Controllers** → handle logic
* **Routes** → define API endpoints
* **Database layer** → data access
* **Middleware** → error handling

---

## Back-end (Database & Algorithm)

*Version 1.0*

### Database

The system uses **SQLite** as the database management system.

#### Stored Data

* Users
* Sessions
* Measurements (joint angles)
* Recommendations

The database is automatically initialized on first run.

---

### Algorithm Module (V1)

* Processes motion data
* Classifies movements
* Generates feedback
* Sends results back to the server

---

## System Workflow

### Sequence Description

1. The mobile app creates a session
2. Sensors send measurements to the server
3. The server stores data in the database
4. The AI module processes the data
5. Recommendations are generated
6. Results are returned to the user

---

## Data Flow

```
Sensors → Server → Database
                 ↓
              AI Module
                 ↓
        Recommendations → Front-end
```

---

## Non-functional Requirement Response

* **Performance**: Supports near real-time data collection via REST APIs
* **Scalability**: Modular architecture allows independent scaling
* **Reliability**: Error handling middleware ensures stable responses
* **Maintainability**: Clear separation of concerns (MVC structure)
* **Security**: Input validation and structured API endpoints

---

## Technical Route Selection

* **Backend**: Node.js + Express
* **Database**: SQLite
* **Communication**: REST API (JSON)
* **Architecture**: Modular MVC-based design

---

## Conclusion

The system design ensures a clear separation between data collection, processing, and presentation layers.

The V2 backend plays a central role in integrating all modules, ensuring efficient communication and reliable data management across the distributed system.

---